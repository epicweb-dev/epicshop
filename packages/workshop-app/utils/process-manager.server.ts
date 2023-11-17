import { type ChildProcess, spawn } from 'child_process'
import net from 'net'
import chalk from 'chalk'
import closeWithGrace from 'close-with-grace'
import { execaCommand } from 'execa'
import fkill from 'fkill'
import waitOn from 'wait-on'
import { type App } from './apps.server.ts'
import { singleton } from './singleton.server.ts'

const isDeployed =
	process.env.KCDSHOP_DEPLOYED === 'true' ||
	process.env.KCDSHOP_DEPLOYED === '1'

type DevProcessesMap = Map<
	string,
	{
		color: (typeof colors)[number]
		process: ChildProcess
		port: number
	}
>

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
	var __process_dev_close_with_grace_return__: ReturnType<typeof closeWithGrace>
	var __process_test_close_with_grace_return__: ReturnType<
		typeof closeWithGrace
	>
}

const devProcesses = singleton('dev_processes', getDevProcessesMap)
const testProcesses = singleton('test_processes', getTestProcessesMap)

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
	const availableColors = colors.filter(color =>
		Array.from(devProcesses.values()).every(p => p.color !== color),
	)
	const color =
		availableColors[devProcesses.size % availableColors.length] ?? 'blue'
	const appProcess = spawn('npm', ['run', 'dev'], {
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
				.map(line => `${prefix} ${line}`)
				.join('\n'),
		)
	}
	appProcess.stdout.on('data', handleStdOutData)
	function handleStdErrData(data: Buffer) {
		console.error(
			data
				.toString('utf-8')
				.split('\n')
				.map(line => `${prefix} ${line}`)
				.join('\n'),
		)
	}
	appProcess.stderr.on('data', handleStdErrData)
	devProcesses.set(key, { color, process: appProcess, port: portNumber })
	appProcess.on('exit', code => {
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

	const testProcess = execaCommand(app.test.script, {
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
	testProcess.stdout?.on('data', handleStdOutData)
	function handleStdErrData(data: Buffer) {
		output.push({
			type: 'stderr',
			content: data.toString('utf-8'),
			timestamp: Date.now(),
		})
	}
	testProcess.stderr?.on('data', handleStdErrData)
	testProcess.on('exit', code => {
		testProcess.stdout?.off('data', handleStdOutData)
		testProcess.stderr?.off('data', handleStdErrData)
		// don't delete the entry from the map so we can show the output at any time
		entry.process = null
		entry.exitCode = code
	})
	testProcesses.set(key, entry)
	return testProcess
}

export async function waitOnApp(app: App) {
	if (app.dev.type === 'script') {
		return waitOn({
			resources: [`http-get://localhost:${app.dev.portNumber}`],
			timeout: 20_000,
		})
	}
}

export function isPortAvailable(port: number | string): Promise<boolean> {
	return new Promise(resolve => {
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

export function isAppRunning(app: { name: string }) {
	try {
		const devProcess = devProcesses.get(app.name)
		if (!devProcess) return false
		if (devProcess.process === null) return false
		devProcess.process.kill(0)
		return true
	} catch {
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
	return { devProcesses, testProcesses }
}

export async function closeProcess(key: string) {
	if (isDeployed) throw new Error('cannot close processes in deployed mode')
	const proc = devProcesses.get(key)
	if (proc) {
		const exitedPromise = new Promise(resolve =>
			proc.process.on('exit', resolve),
		)
		if (process.platform === 'win32') {
			const { execa } = await import('execa')
			await execa('taskkill', ['/pid', String(proc.process.pid), '/f', '/t'])
		} else {
			proc.process.kill()
		}
		await Promise.race([
			new Promise(resolve => setTimeout(resolve, 500)),
			exitedPromise,
		])
		await stopPort(proc.port) // just in case 🤷‍♂️
		devProcesses.delete(key)
	}
}

const sleep = (t: number) => new Promise(resolve => setTimeout(resolve, t))

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
