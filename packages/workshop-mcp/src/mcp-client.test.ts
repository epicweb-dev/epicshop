import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

const testTimeoutMs = 15000

type JsonRpcResponse = {
	id?: number
	result?: Record<string, unknown>
	error?: { message?: string }
}

type ToolListResult = {
	tools: Array<{ name: string; description?: string; inputSchema?: unknown }>
}

type ToolCallResult = {
	content: Array<{ type: string; text?: string }>
	structuredContent?: Record<string, unknown>
	isError?: boolean
}

class McpTestClient {
	#child: ReturnType<typeof spawn>
	#stdin: NodeJS.WritableStream
	#stdout: NodeJS.ReadableStream
	#buffer = ''
	#pending = new Map<
		number,
		{
			resolve: (value: Record<string, unknown>) => void
			reject: (error: Error) => void
			timeoutId: NodeJS.Timeout
		}
	>()
	#nextId = 1

	constructor(child: ReturnType<typeof spawn>) {
		this.#child = child
		if (!this.#child.stdout || !this.#child.stdin) {
			throw new Error('Failed to start MCP server stdio streams.')
		}
		this.#stdout = this.#child.stdout
		this.#stdin = this.#child.stdin
		this.#stdout.setEncoding('utf8')
		this.#stdout.on('data', (chunk: string) => this.onStdout(chunk))
		this.#child.on('exit', (code) => this.failPendingRequests(code))
		this.#child.on('error', (error) => this.failPendingRequests(error))
	}

	static async start() {
		const testFilePath = fileURLToPath(import.meta.url)
		const testDir = path.dirname(testFilePath)
		const packageRoot = path.resolve(testDir, '..')
		const workspaceRoot = path.resolve(packageRoot, '..', '..')
		const tsxPackage = path.join(workspaceRoot, 'node_modules', 'tsx')
		const serverEntry = path.join(packageRoot, 'src', 'index.ts')

		if (!existsSync(tsxPackage)) {
			throw new Error(`tsx package not found at ${tsxPackage}`)
		}

		const child = spawn(process.execPath, ['--import', 'tsx', serverEntry], {
			stdio: ['pipe', 'pipe', 'pipe'],
			cwd: workspaceRoot,
			env: {
				...process.env,
				NODE_ENV: 'test',
			},
		})

		return new McpTestClient(child)
	}

	async initialize() {
		const result = await this.request('initialize', {
			protocolVersion: '2025-03-26',
			capabilities: {
				tools: {},
				resources: {},
				prompts: {},
			},
			clientInfo: {
				name: 'workshop-mcp-test-client',
				version: '0.0.0',
			},
		})
		this.notify('notifications/initialized')
		return result
	}

	async listTools() {
		return (await this.request('tools/list')) as ToolListResult
	}

	async callTool(name: string, args?: Record<string, unknown>) {
		return (await this.request('tools/call', {
			name,
			arguments: args ?? {},
		})) as ToolCallResult
	}

	async close() {
		if (this.#child.killed || this.#child.exitCode !== null) return
		this.#child.kill()
		await new Promise<void>((resolve) => {
			this.#child.once('exit', () => resolve())
		})
	}

	notify(method: string, params?: Record<string, unknown>) {
		this.write({ jsonrpc: '2.0', method, params })
	}

	request(method: string, params?: Record<string, unknown>) {
		const id = this.#nextId++
		const payload = { jsonrpc: '2.0', id, method, params }

		return new Promise<Record<string, unknown>>((resolve, reject) => {
			const timeoutId = setTimeout(() => {
				this.#pending.delete(id)
				reject(new Error(`Request timed out: ${method}`))
			}, testTimeoutMs)
			this.#pending.set(id, { resolve, reject, timeoutId })
			this.write(payload)
		})
	}

	write(payload: Record<string, unknown>) {
		this.#stdin.write(`${JSON.stringify(payload)}\n`)
	}

	onStdout(chunk: string) {
		this.#buffer += chunk
		let newlineIndex = this.#buffer.indexOf('\n')
		while (newlineIndex !== -1) {
			const line = this.#buffer.slice(0, newlineIndex).trim()
			this.#buffer = this.#buffer.slice(newlineIndex + 1)
			if (line.length === 0) {
				newlineIndex = this.#buffer.indexOf('\n')
				continue
			}
			this.handleLine(line)
			newlineIndex = this.#buffer.indexOf('\n')
		}
	}

	handleLine(line: string) {
		let message: JsonRpcResponse | null = null
		try {
			message = JSON.parse(line) as JsonRpcResponse
		} catch {
			return
		}
		if (typeof message?.id !== 'number') return

		const pending = this.#pending.get(message.id)
		if (!pending) return
		clearTimeout(pending.timeoutId)
		this.#pending.delete(message.id)

		if (message.error) {
			pending.reject(
				new Error(message.error.message ?? 'Unknown JSON-RPC error'),
			)
			return
		}

		pending.resolve(message.result ?? {})
	}

	failPendingRequests(reason: unknown) {
		const error = new Error(
			reason instanceof Error ? reason.message : `Process exited: ${reason}`,
		)
		for (const pending of this.#pending.values()) {
			clearTimeout(pending.timeoutId)
			pending.reject(error)
		}
		this.#pending.clear()
	}
}

type DisposableClient = {
	client: McpTestClient
	initResult: Record<string, unknown>
	[Symbol.asyncDispose]: () => Promise<void>
}

async function createDisposableClient(): Promise<DisposableClient> {
	const client = await McpTestClient.start()
	try {
		const initResult = await client.initialize()
		return {
			client,
			initResult,
			async [Symbol.asyncDispose]() {
				await client.close()
			},
		}
	} catch (error) {
		await client.close()
		throw error
	}
}

function resolveWorkspaceRoot() {
	const testFilePath = fileURLToPath(import.meta.url)
	const testDir = path.dirname(testFilePath)
	const packageRoot = path.resolve(testDir, '..')
	return path.resolve(packageRoot, '..', '..')
}

test(
	'workshop MCP server initializes with instructions and server info',
	async () => {
		await using resources = await createDisposableClient()
		expect(resources.initResult).toEqual(
			expect.objectContaining({
				protocolVersion: expect.any(String),
				serverInfo: expect.any(Object),
				instructions: expect.any(String),
			}),
		)
	},
	testTimeoutMs,
)

test(
	'workshop MCP server lists tools with expected shape',
	async () => {
		await using resources = await createDisposableClient()
		const resultPromise = resources.client.listTools()
		await expect(resultPromise).resolves.toEqual(
			expect.objectContaining({
				tools: expect.arrayContaining([
					expect.objectContaining({ name: 'get_what_is_next' }),
				]),
			}),
		)
	},
	testTimeoutMs,
)

test(
	'workshop MCP server get_what_is_next returns text content and structured payload',
	async () => {
		await using resources = await createDisposableClient()
		const workshopDirectory = path.join(resolveWorkspaceRoot(), 'example')
		const resultPromise = resources.client.callTool('get_what_is_next', {
			workshopDirectory,
		})

		await expect(resultPromise).resolves.toEqual(
			expect.objectContaining({
				content: expect.arrayContaining([
					expect.objectContaining({
						type: 'text',
						text: expect.any(String),
					}),
				]),
				structuredContent: expect.any(Object),
			}),
		)
	},
	testTimeoutMs,
)

test(
	'workshop MCP server returns tool error response for invalid workshop directory',
	async () => {
		await using resources = await createDisposableClient()
		const resultPromise = resources.client.callTool('get_workshop_context', {
			workshopDirectory: '/not/a/workshop',
		})

		await expect(resultPromise).resolves.toEqual(
			expect.objectContaining({
				isError: true,
				content: expect.arrayContaining([
					expect.objectContaining({ type: 'text' }),
				]),
			}),
		)
	},
	testTimeoutMs,
)
