import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

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
	private child: ReturnType<typeof spawn>
	private stdin: NodeJS.WritableStream
	private stdout: NodeJS.ReadableStream
	private buffer = ''
	private pending = new Map<
		number,
		{
			resolve: (value: Record<string, unknown>) => void
			reject: (error: Error) => void
			timeoutId: NodeJS.Timeout
		}
	>()
	private nextId = 1

	private constructor(child: ReturnType<typeof spawn>) {
		this.child = child
		if (!this.child.stdout || !this.child.stdin) {
			throw new Error('Failed to start MCP server stdio streams.')
		}
		this.stdout = this.child.stdout
		this.stdin = this.child.stdin
		this.stdout.setEncoding('utf8')
		this.stdout.on('data', (chunk: string) => this.onStdout(chunk))
		this.child.on('exit', (code) => this.failPendingRequests(code))
		this.child.on('error', (error) => this.failPendingRequests(error))
	}

	static async start() {
		const testFilePath = fileURLToPath(import.meta.url)
		const testDir = path.dirname(testFilePath)
		const packageRoot = path.resolve(testDir, '..')
		const workspaceRoot = path.resolve(packageRoot, '..', '..')
		const tsxBinary = path.join(
			workspaceRoot,
			'node_modules',
			'.bin',
			process.platform === 'win32' ? 'tsx.cmd' : 'tsx',
		)
		const serverEntry = path.join(packageRoot, 'src', 'index.ts')

		if (!existsSync(tsxBinary)) {
			throw new Error(`tsx binary not found at ${tsxBinary}`)
		}

		const child = spawn(tsxBinary, [serverEntry], {
			stdio: ['pipe', 'pipe', 'pipe'],
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
		if (this.child.killed) return
		this.child.kill()
		await new Promise<void>((resolve) => {
			this.child.once('exit', () => resolve())
		})
	}

	private notify(method: string, params?: Record<string, unknown>) {
		this.write({ jsonrpc: '2.0', method, params })
	}

	private request(method: string, params?: Record<string, unknown>) {
		const id = this.nextId++
		const payload = { jsonrpc: '2.0', id, method, params }

		return new Promise<Record<string, unknown>>((resolve, reject) => {
			const timeoutId = setTimeout(() => {
				this.pending.delete(id)
				reject(new Error(`Request timed out: ${method}`))
			}, testTimeoutMs)
			this.pending.set(id, { resolve, reject, timeoutId })
			this.write(payload)
		})
	}

	private write(payload: Record<string, unknown>) {
		this.stdin.write(`${JSON.stringify(payload)}\n`)
	}

	private onStdout(chunk: string) {
		this.buffer += chunk
		let newlineIndex = this.buffer.indexOf('\n')
		while (newlineIndex !== -1) {
			const line = this.buffer.slice(0, newlineIndex).trim()
			this.buffer = this.buffer.slice(newlineIndex + 1)
			if (line.length === 0) {
				newlineIndex = this.buffer.indexOf('\n')
				continue
			}
			this.handleLine(line)
			newlineIndex = this.buffer.indexOf('\n')
		}
	}

	private handleLine(line: string) {
		let message: JsonRpcResponse | null = null
		try {
			message = JSON.parse(line) as JsonRpcResponse
		} catch {
			return
		}
		if (typeof message?.id !== 'number') return

		const pending = this.pending.get(message.id)
		if (!pending) return
		clearTimeout(pending.timeoutId)
		this.pending.delete(message.id)

		if (message.error) {
			pending.reject(
				new Error(message.error.message ?? 'Unknown JSON-RPC error'),
			)
			return
		}

		pending.resolve(message.result ?? {})
	}

	private failPendingRequests(reason: unknown) {
		const error = new Error(
			reason instanceof Error ? reason.message : `Process exited: ${reason}`,
		)
		for (const pending of this.pending.values()) {
			clearTimeout(pending.timeoutId)
			pending.reject(error)
		}
		this.pending.clear()
	}
}

describe('workshop MCP server', () => {
	let client: McpTestClient
	let initResult: Record<string, unknown>

	beforeAll(async () => {
		client = await McpTestClient.start()
		initResult = await client.initialize()
	}, testTimeoutMs)

	afterAll(async () => {
		await client.close()
	})

	test(
		'initializes with instructions and server info',
		() => {
			expect(typeof initResult.protocolVersion).toBe('string')
			expect(typeof initResult.serverInfo).toBe('object')
			expect(typeof initResult.instructions).toBe('string')
		},
		testTimeoutMs,
	)

	test(
		'lists tools with expected shape',
		async () => {
			const result = await client.listTools()
			expect(Array.isArray(result.tools)).toBe(true)
			expect(result.tools.length).toBeGreaterThan(0)
			expect(
				result.tools.some((tool) => tool.name === 'get_what_is_next'),
			).toBe(true)
		},
		testTimeoutMs,
	)

	test(
		'get_what_is_next returns text content and structured payload',
		async () => {
			const testFilePath = fileURLToPath(import.meta.url)
			const testDir = path.dirname(testFilePath)
			const packageRoot = path.resolve(testDir, '..')
			const workspaceRoot = path.resolve(packageRoot, '..', '..')
			const workshopDirectory = path.join(workspaceRoot, 'example')

			const result = await client.callTool('get_what_is_next', {
				workshopDirectory,
			})

			expect(Array.isArray(result.content)).toBe(true)
			expect(result.content.length).toBeGreaterThan(0)
			expect(result.content[0]?.type).toBe('text')
			expect(typeof result.content[0]?.text).toBe('string')
			expect(typeof result.structuredContent).toBe('object')
		},
		testTimeoutMs,
	)

	test(
		'returns tool error response for invalid workshop directory',
		async () => {
			const result = await client.callTool('get_workshop_context', {
				workshopDirectory: '/not/a/workshop',
			})

			expect(result.isError).toBe(true)
			expect(Array.isArray(result.content)).toBe(true)
			expect(result.content[0]?.type).toBe('text')
		},
		testTimeoutMs,
	)
})
