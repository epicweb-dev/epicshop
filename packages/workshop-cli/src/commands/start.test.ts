import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { test } from 'vitest'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..', '..', '..', '..')

const testIf = process.platform === 'win32' ? test.skip : test

testIf(
	'start releases the child server port on shutdown',
	async () => {
		const { appDir, runnerPath, cleanup } = await createRunnerFixture()
		let child: ChildProcess | null = null
		try {
			child = spawn(
				process.execPath,
				['--experimental-transform-types', runnerPath],
				{
					cwd: repoRoot,
					env: {
						...process.env,
						EPICSHOP_APP_LOCATION: appDir,
						EPICSHOP_CONTEXT_CWD: appDir,
						NODE_ENV: 'development',
					},
					stdio: ['ignore', 'pipe', 'pipe'],
				},
			)

			if (!child) {
				throw new Error('Failed to start runner process.')
			}

			if (!child.stdout || !child.stderr) {
				throw new Error('Expected child process stdio to be piped.')
			}

			const stderr = captureStderr(child)
			const port = await waitForPort(child, 15000, stderr)
			await waitForServer(port)

			child.kill('SIGINT')
			await waitForExit(child, 15000)

			await assertPortAvailable(port)
		} finally {
			if (child && !child.killed) {
				child.kill('SIGKILL')
			}
			await cleanup()
		}
	},
	20000,
)

async function createRunnerFixture() {
	const rootDir = await mkdtemp(path.join(os.tmpdir(), 'epicshop-start-'))
	const appDir = path.join(rootDir, 'fake-workshop')
	await mkdir(path.join(appDir, 'server'), { recursive: true })
	await mkdir(path.join(appDir, 'app'), { recursive: true })

	await writeFile(
		path.join(appDir, 'package.json'),
		JSON.stringify(
			{
				name: 'fake-workshop',
				version: '0.0.0',
				type: 'module',
				epicshop: {
					githubRepo: 'https://github.com/example/fake-workshop',
				},
			},
			null,
			2,
		),
	)

	await writeFile(
		path.join(appDir, 'server', 'dev-server.js'),
		[
			"import http from 'node:http'",
			'',
			'const server = http.createServer((_, res) => {',
			'  res.statusCode = 200',
			"  res.end('ok')",
			'})',
			'',
			"server.listen(0, '127.0.0.1', () => {",
			'  const address = server.address()',
			"  const port = typeof address === 'object' && address ? address.port : 0",
			'  console.log(`Local: http://localhost:${port}`)',
			'})',
			'',
			'const shutdown = () => {',
			'  server.close(() => process.exit(0))',
			'}',
			"process.on('SIGTERM', shutdown)",
			"process.on('SIGINT', shutdown)",
			'',
		].join('\n'),
	)

	const runnerPath = path.join(rootDir, 'start-runner.ts')
	const startModuleUrl = pathToFileURL(
		path.join(
			repoRoot,
			'packages',
			'workshop-cli',
			'src',
			'commands',
			'start.ts',
		),
	).href

	await writeFile(
		runnerPath,
		[
			`import { start } from ${JSON.stringify(startModuleUrl)}`,
			'',
			'start({ appLocation: process.env.EPICSHOP_APP_LOCATION })',
			'  .catch((error) => {',
			'    console.error(error)',
			'    process.exit(1)',
			'  })',
			'',
		].join('\n'),
	)

	return {
		appDir,
		runnerPath,
		cleanup: async () => {
			await rm(rootDir, { recursive: true, force: true })
		},
	}
}

function captureStderr(child: ChildProcess) {
	let buffer = ''
	child.stderr?.on('data', (data: Buffer) => {
		buffer += data.toString('utf8')
	})
	return () => buffer
}

async function waitForPort(
	child: ChildProcess,
	timeoutMs: number,
	getStderr: () => string,
) {
	let buffer = ''
	return new Promise<number>((resolve, reject) => {
		const stdout = child.stdout
		if (!stdout) {
			reject(new Error('Child stdout is not available for port detection.'))
			return
		}
		let resolved = false
		const timeoutId = setTimeout(() => {
			if (resolved) return
			reject(
				new Error(
					`Timed out waiting for port output.\nstdout:\n${buffer}\nstderr:\n${getStderr()}`,
				),
			)
		}, timeoutMs)

		const onData = (data: Buffer) => {
			const text = data.toString('utf8')
			buffer += text
			const match = buffer.match(/localhost:(\d+)/)
			if (match) {
				resolved = true
				clearTimeout(timeoutId)
				stdout.off('data', onData)
				child.off('exit', onExit)
				resolve(Number(match[1]))
			}
		}

		const onExit = () => {
			if (resolved) return
			clearTimeout(timeoutId)
			reject(
				new Error(
					`Process exited before port output.\nstdout:\n${buffer}\nstderr:\n${getStderr()}`,
				),
			)
		}

		stdout.on('data', onData)
		child.once('exit', onExit)
	})
}

async function waitForServer(port: number) {
	const url = `http://localhost:${port}`
	for (let attempt = 0; attempt < 20; attempt++) {
		try {
			const res = await fetch(url, { method: 'GET' })
			if (res.ok) return
		} catch {}
		await new Promise((resolve) => setTimeout(resolve, 200))
	}
	throw new Error(`Server did not respond at ${url}`)
}

async function waitForExit(child: ChildProcess, timeoutMs: number) {
	let timeoutId: NodeJS.Timeout | undefined
	const timeout = new Promise((_, reject) => {
		timeoutId = setTimeout(() => {
			reject(new Error('Timed out waiting for process exit'))
		}, timeoutMs)
	})
	await Promise.race([once(child, 'exit'), timeout])
	if (timeoutId !== undefined) {
		clearTimeout(timeoutId)
	}
}

async function assertPortAvailable(port: number) {
	await new Promise<void>((resolve, reject) => {
		const server = net.createServer()
		server.once('error', (error) => {
			reject(error)
		})
		server.listen(port, '127.0.0.1', () => {
			server.close(() => resolve())
		})
	})
}
