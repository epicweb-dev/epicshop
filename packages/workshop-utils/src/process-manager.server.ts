import './init-env.ts'

import { spawn, type ChildProcess } from 'child_process'
import net from 'node:net'
import { remember } from '@epic-web/remember'
import chalk from 'chalk'
import closeWithGrace from 'close-with-grace'
import findProcessDefault from 'find-process'
import fkill from 'fkill'
import { type App } from './apps.server.ts'
import { getWorkshopUrl } from './config.server.ts'
import { getEnv } from './env.server.ts'
import { getErrorMessage } from './utils.ts'

// https://github.com/yibn2008/find-process/issues/85
const findProcess = ('default' in findProcessDefault
	? findProcessDefault.default
	: findProcessDefault) as unknown as typeof findProcessDefault

const isDeployed =
	process.env.EPICSHOP_DEPLOYED === 'true' ||
	process.env.EPICSHOP_DEPLOYED === '1'

type DevProcessesMap = Map<
	string,
	{
		color: (typeof colors)[number]
		process: ChildProcess
		port: number
	}
>

type SidecarOutputLine = {
	type: 'stdout' | 'stderr'
	content: string
	timestamp: number
}

type SidecarProcessEntry = {
	color: (typeof colors)[number]
	process: ChildProcess
	command: string
	output: Array<SidecarOutputLine>
}

type SidecarProcessesMap = Map<string, SidecarProcessEntry>

type OutputLine = {
	type: 'stdout' | 'stderr'
	content: string
	timestamp: number
}

type TestProcessEntry = {
	process: ChildProcess | null
	output: Array<OutputLine>
	exitCode?: number | null
}

type TestProcessesMap = Map<string, TestProcessEntry>
declare global {
	var __process_dev_close_with_grace_return__: ReturnType<
			typeof closeWithGrace
		>,
		__process_test_close_with_grace_return__: ReturnType<typeof closeWithGrace>,
		__process_sidecar_close_with_grace_return__: ReturnType<
			typeof closeWithGrace
		>
}

const devProcesses = remember('dev_processes', getDevProcessesMap)
const testProcesses = remember('test_processes', getTestProcessesMap)
const sidecarProcesses = remember('sidecar_processes', getSidecarProcessesMap)

function getDevProcessesMap() {
	const procs: DevProcessesMap = new Map()

	global.__process_dev_close_with_grace_return__?.uninstall()

	global.__process_dev_close_with_grace_return__ = closeWithGrace(async () => {
		for (const [name, proc] of procs.entries()) {
			console.log('closing', name)
			proc.process.kill()
		}
	})
	return procs
}

function getTestProcessesMap() {
	const procs: TestProcessesMap = new Map()

	global.__process_test_close_with_grace_return__?.uninstall()

	global.__process_test_close_with_grace_return__ = closeWithGrace(async () => {
		for (const [id, proc] of procs.entries()) {
			if (proc.process) {
				console.log('closing', id)
				proc.process.kill()
			}
		}
	})
	return procs
}

function getSidecarProcessesMap() {
	const procs: SidecarProcessesMap = new Map()

	global.__process_sidecar_close_with_grace_return__?.uninstall()

	global.__process_sidecar_close_with_grace_return__ = closeWithGrace(
		async () => {
			for (const [name, proc] of procs.entries()) {
				console.log('closing sidecar', name)
				proc.process.kill()
			}
		},
	)
	return procs
}

const colors = [
	'blue',
	'green',
	'yellow',
	'red',
	'magenta',
	'redBright',
	'greenBright',
	'yellowBright',
	'blueBright',
	'magentaBright',
] as const

function getNextAvailableColor(): (typeof colors)[number] {
	const usedColors = new Set<(typeof colors)[number]>()

	// Collect colors used by dev processes
	for (const proc of devProcesses.values()) {
		usedColors.add(proc.color)
	}

	// Collect colors used by sidecar processes
	for (const proc of sidecarProcesses.values()) {
		usedColors.add(proc.color)
	}

	// Find available colors
	const availableColors = colors.filter((color) => !usedColors.has(color))

	if (availableColors.length === 0) {
		// If all colors are used, cycle through them based on total process count
		const totalProcesses = devProcesses.size + sidecarProcesses.size
		return colors[totalProcesses % colors.length] ?? 'blue'
	}

	// Use the first available color
	return availableColors[0] ?? 'blue'
}

export async function runAppDev(app: App) {
	if (isDeployed) throw new Error('cannot run apps in deployed mode')
	const key = app.name
	// if the app is already running, don't start it again
	if (devProcesses.has(key)) {
		return { status: 'process-running', running: true } as const
	}

	if (app.dev.type !== 'script') {
		return { status: 'error', error: 'no-server' } as const
	}

	const { portNumber } = app.dev
	if (!(await isPortAvailable(portNumber))) {
		return { status: 'port-unavailable', running: false, portNumber } as const
	}
	const color = getNextAvailableColor()
	const appProcess = spawn('npm', ['run', 'dev', '--silent'], {
		cwd: app.fullPath,
		shell: true,
		stdio: ['ignore', 'pipe', 'pipe'],
		env: {
			...process.env,
			// TODO: support specifying the env
			NODE_ENV: 'development',
			// TODO: support specifying the port
			PORT: String(portNumber),
			APP_SERVER_PORT: String(portNumber),
			// let it pick a random port...
			REMIX_DEV_SERVER_WS_PORT: '',
		},
	})
	const prefix = chalk[color](
		`[${app.name.replace(/^exercises\./, '')}:${portNumber}]`,
	)
	function handleStdOutData(data: Buffer) {
		console.log(
			data
				.toString('utf-8')
				.split('\n')
				.map((line) => `${prefix} ${line}`)
				.join('\n'),
		)
	}
	appProcess.stdout.on('data', handleStdOutData)
	function handleStdErrData(data: Buffer) {
		console.error(
			data
				.toString('utf-8')
				.split('\n')
				.map((line) => `${prefix} ${line}`)
				.join('\n'),
		)
	}
	appProcess.stderr.on('data', handleStdErrData)
	devProcesses.set(key, { color, process: appProcess, port: portNumber })
	appProcess.on('exit', (code) => {
		appProcess.stdout.off('data', handleStdOutData)
		appProcess.stderr.off('data', handleStdErrData)
		console.log(`${prefix} exited (${code})`)
		devProcesses.delete(key)
	})

	return { status: 'process-started', running: true } as const
}

export async function runAppTests(app: App) {
	if (isDeployed) throw new Error('cannot run tests in deployed mode')
	const key = app.name

	if (app.test.type !== 'script') {
		return { status: 'error', error: 'no-test' } as const
	}

	const testProcess = spawn('npm', ['run', 'test', '--silent'], {
		cwd: app.fullPath,
		shell: true,
		stdio: ['ignore', 'pipe', 'pipe'],
		env: {
			...process.env,
			// TODO: support specifying the env
			NODE_ENV: 'development',
			// TODO: support specifying the port
			PORT: app.dev.type === 'script' ? String(app.dev.portNumber) : undefined,
			APP_SERVER_PORT:
				app.dev.type === 'script' ? String(app.dev.portNumber) : undefined,
			// let it pick a random port...
			REMIX_DEV_SERVER_WS_PORT: '',
		},
	})
	const output: Array<OutputLine> = []
	const entry: TestProcessEntry = { process: testProcess, output }
	function handleStdOutData(data: Buffer) {
		output.push({
			type: 'stdout',
			content: data.toString('utf-8'),
			timestamp: Date.now(),
		})
	}
	testProcess.stdout.on('data', handleStdOutData)
	function handleStdErrData(data: Buffer) {
		output.push({
			type: 'stderr',
			content: data.toString('utf-8'),
			timestamp: Date.now(),
		})
	}
	testProcess.stderr.on('data', handleStdErrData)
	testProcess.on('exit', (code) => {
		testProcess.stdout.off('data', handleStdOutData)
		testProcess.stderr.off('data', handleStdErrData)
		entry.process = null
		entry.exitCode = code
	})
	testProcesses.set(key, entry)
	return testProcess
}

export async function waitOnApp(app: App) {
	if (app.dev.type === 'script') {
		const startTime = Date.now()

		const retryInterval = 100
		const timeout = 20_000
		let lastError: unknown
		while (Date.now() - startTime < timeout) {
			try {
				const url = getWorkshopUrl(app.dev.portNumber)
				await fetch(url, {
					method: 'HEAD',
					headers: { Accept: '*/*' },
				})
				return { status: 'success' } as const
			} catch (error) {
				lastError = error
				await new Promise((resolve) => setTimeout(resolve, retryInterval))
			}
		}

		return { status: 'error', error: getErrorMessage(lastError) } as const
	}
	return null
}

export function isPortAvailable(port: number | string): Promise<boolean> {
	return new Promise((resolve) => {
		const server = net.createServer()
		server.unref()
		server.on('error', () => resolve(false))

		server.listen(Number(port), () => {
			server.close(() => {
				resolve(true)
			})
		})
	})
}

export async function isAppRunning(app: { name: string }) {
	try {
		const devProcess = devProcesses.get(app.name)
		if (!devProcess?.process.pid) return false
		// @ts-ignore - find-process is not typed correctly
		// https://github.com/yibn2008/find-process/issues/85
		const found = await findProcess('pid', devProcess.process.pid)
		return found.length > 0
	} catch (error: unknown) {
		console.error('Error checking if app is running:', getErrorMessage(error))
		return false
	}
}

export function isTestRunning(app: { name: string }) {
	try {
		const testProcess = testProcesses.get(app.name)
		if (!testProcess) return false
		if (testProcess.process === null) return false
		testProcess.process.kill(0)
		return true
	} catch {
		return false
	}
}

export function getTestProcessEntry(app: { name: string }) {
	return testProcesses.get(app.name)
}

export function clearTestProcessEntry(app: { name: string }) {
	return testProcesses.delete(app.name)
}

export function getProcesses() {
	return { devProcesses, testProcesses, sidecarProcesses }
}

export function startSidecarProcesses(processes: Record<string, string>) {
	if (isDeployed) {
		console.log('Sidecar processes are not supported in deployed mode')
		return
	}

	for (const [name, command] of Object.entries(processes)) {
		startSidecarProcess(name, command)
	}
}

// Maximum number of log entries to keep per sidecar process
const MAX_SIDECAR_LOG_ENTRIES = 1000

export function startSidecarProcess(name: string, command: string) {
	if (isDeployed)
		throw new Error('cannot run sidecar processes in deployed mode')

	// if the process is already running, don't start it again
	const existingEntry = sidecarProcesses.get(name)
	if (existingEntry && existingEntry.process.exitCode === null) {
		console.log(`Sidecar process ${name} is already running`)
		return
	}

	// If there's an old exited entry, clean it up first
	if (existingEntry) {
		sidecarProcesses.delete(name)
	}

	const color = getNextAvailableColor()

	// Spawn the command using shell to handle complex commands properly
	const workshopRoot = getEnv().EPICSHOP_CONTEXT_CWD
	const sidecarProcess = spawn(command, [], {
		shell: true,
		cwd: workshopRoot,
		stdio: ['ignore', 'pipe', 'pipe'],
		env: {
			...process.env,
			NODE_ENV: 'development',
		},
	})

	const prefix = chalk[color](`[${name}]`)
	const output: Array<SidecarOutputLine> = []

	function addOutputLine(type: 'stdout' | 'stderr', content: string) {
		output.push({ type, content, timestamp: Date.now() })
		// Keep only the last MAX_SIDECAR_LOG_ENTRIES entries
		if (output.length > MAX_SIDECAR_LOG_ENTRIES) {
			output.shift()
		}
	}

	function handleStdOutData(data: Buffer) {
		const content = data.toString('utf-8')
		addOutputLine('stdout', content)
		console.log(
			content
				.split('\n')
				.map((line) => `${prefix} ${line}`)
				.join('\n'),
		)
	}
	sidecarProcess.stdout?.on('data', handleStdOutData)

	function handleStdErrData(data: Buffer) {
		const content = data.toString('utf-8')
		addOutputLine('stderr', content)
		console.error(
			content
				.split('\n')
				.map((line) => `${prefix} ${line}`)
				.join('\n'),
		)
	}
	sidecarProcess.stderr?.on('data', handleStdErrData)

	sidecarProcesses.set(name, {
		color,
		process: sidecarProcess,
		command,
		output,
	})

	sidecarProcess.on('exit', (code: number | null, signal: string | null) => {
		sidecarProcess.stdout?.off('data', handleStdOutData)
		sidecarProcess.stderr?.off('data', handleStdErrData)
		if (code === 0) {
			console.log(`${prefix} exited successfully`)
		} else {
			console.log(
				`${prefix} exited with code ${code}${signal ? ` (signal: ${signal})` : ''}`,
			)
		}
		// Don't delete the entry so we can still access logs after exit
		// Just mark it as not running by keeping the process reference
	})

	sidecarProcess.on('error', (error) => {
		console.error(`${prefix} failed to start: ${error.message}`)
		addOutputLine('stderr', `Failed to start: ${error.message}`)
	})

	console.log(`${prefix} started`)
}

export function getSidecarLogs(name: string, lineCount: number = 50): string {
	const entry = sidecarProcesses.get(name)
	if (!entry) return ''

	// Get the last N lines of output
	const logs = entry.output.slice(-lineCount)
	return logs.map((line) => line.content).join('')
}

export async function restartSidecarProcess(name: string): Promise<boolean> {
	if (isDeployed)
		throw new Error('cannot restart sidecar processes in deployed mode')

	const entry = sidecarProcesses.get(name)
	if (!entry) {
		console.log(`Sidecar process ${name} not found`)
		return false
	}

	const { command, process: proc, output: oldOutput } = entry

	// Remove the entry immediately to prevent concurrent restarts
	sidecarProcesses.delete(name)

	// Kill the existing process if it's still running
	if (proc.exitCode === null) {
		console.log(`Stopping sidecar process: ${name}`)
		proc.kill()

		// Wait for the process to exit
		await new Promise<void>((resolve) => {
			const timeout = setTimeout(() => {
				// Force kill if it doesn't exit in time
				proc.kill('SIGKILL')
				resolve()
			}, 5000)

			proc.once('exit', () => {
				clearTimeout(timeout)
				resolve()
			})
		})
	}

	// Start a new process with the same command
	startSidecarProcess(name, command)

	// Preserve logs from the old process by prepending them to the new array
	// We must modify the existing array (not replace it) because event handlers
	// have already captured it in their closure
	const newEntry = sidecarProcesses.get(name)
	if (newEntry) {
		// Prepend old logs to the existing array that handlers are writing to
		newEntry.output.unshift(...oldOutput)
		// Trim to max entries if needed
		if (newEntry.output.length > MAX_SIDECAR_LOG_ENTRIES) {
			newEntry.output.splice(
				0,
				newEntry.output.length - MAX_SIDECAR_LOG_ENTRIES,
			)
		}
	}

	return true
}

export function stopSidecarProcesses() {
	if (isDeployed)
		throw new Error('cannot stop sidecar processes in deployed mode')

	for (const [name, entry] of sidecarProcesses.entries()) {
		console.log(`Stopping sidecar process: ${name}`)
		entry.process.kill()
	}
	sidecarProcesses.clear()
}

export async function closeProcess(key: string) {
	if (isDeployed) throw new Error('cannot close processes in deployed mode')
	const proc = devProcesses.get(key)
	if (proc) {
		const exitedPromise = new Promise((resolve) =>
			proc.process.on('exit', resolve),
		)
		if (process.platform === 'win32') {
			const { execa } = await import('execa')
			try {
				await execa('taskkill', ['/pid', String(proc.process.pid), '/f', '/t'])
			} catch (err) {
				console.error(`Failed to taskkill process ${proc.process.pid}:`, err)
			}
		} else {
			proc.process.kill()
		}
		await Promise.race([
			new Promise((resolve) => setTimeout(resolve, 500)),
			exitedPromise,
		])
		await stopPort(proc.port) // just in case 🤷‍♂️
		devProcesses.delete(key)
	}
}

const sleep = (t: number) => new Promise((resolve) => setTimeout(resolve, t))

export async function stopPort(port: string | number) {
	if (isDeployed) throw new Error('cannot stop ports in deployed mode')
	await fkill(`:${port}`, { force: true, silent: true })
	await waitForPortToBeAvailable(port)
}

export async function waitForPortToBeAvailable(port: string | number) {
	// wait for the port to become available again
	const timeout = Date.now() + 10_000
	let portAvailable = false
	do {
		portAvailable = await isPortAvailable(port)
		await sleep(100)
	} while (!portAvailable && Date.now() < timeout)
	if (!portAvailable) {
		console.error('Timed out waiting for the port to become available')
	}
}
