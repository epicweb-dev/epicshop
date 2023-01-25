import type { ChildProcess } from 'child_process'
import { spawn } from 'child_process'
import net from 'net'
import closeWithGrace from 'close-with-grace'
import waitOn from 'wait-on'
import type { App } from './misc.server'

type DevProcessesMap = Map<
	string,
	{
		color: typeof colors[number]
		process: ChildProcess
		port: number
	}
>
declare global {
	var __dev_processes__: DevProcessesMap
}

const devProcesses = (global.__dev_processes__ =
	global.__dev_processes__ ?? getProcessesMap())

function getProcessesMap() {
	const procs = new Map() as DevProcessesMap

	closeWithGrace(() => {
		for (const [name, proc] of procs.entries()) {
			console.log('killing', name)
			proc.process.kill()
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
	const key = app.name
	// if the app is already running, don't start it again
	if (devProcesses.has(key)) {
		return key
	}

	const { portNumber } = app
	if (!(await isPortAvailable(portNumber))) {
		throw new Error(
			`Port ${portNumber} is not available. Something else we're not managing is running on that port.`,
		)
	}
	const availableColors = colors.filter(color =>
		Array.from(devProcesses.values()).every(p => p.color !== color),
	)
	const color = availableColors[devProcesses.size % availableColors.length]
	const appProcess = spawn('npm', ['run', 'dev'], {
		cwd: app.fullPath,
		env: {
			...process.env,
			// TODO: support specifying the env
			NODE_ENV: 'development',
			// TODO: support specifying the port
			PORT: String(portNumber),
			// let it pick a random port...
			REMIX_DEV_SERVER_WS_PORT: '',
		},
	})
	const { default: chalk } = await import('chalk')
	const prefix = chalk[color](`[${app.name}:${portNumber}]`)
	appProcess.stdout.on('data', data => {
		console.log(
			String(data)
				.split('\n')
				.map(line => `${prefix} ${line}`)
				.join('\n'),
		)
	})
	appProcess.stderr.on('data', data => {
		console.log(
			String(data)
				.split('\n')
				.map(line => `${prefix} ${line}`)
				.join('\n'),
		)
	})
	devProcesses.set(key, { color, process: appProcess, port: portNumber })
	// remove on exit
	appProcess.on('exit', code => {
		console.log(`${prefix} exited (${code})`)
		devProcesses.delete(key)
	})
	appProcess.on('close', code => {
		console.log(`${prefix} closed (${code})`)
		devProcesses.delete(key)
	})

	return key
}

export async function waitOnApp(app: App) {
	return waitOn({
		resources: [`http://localhost:${app.portNumber}`],
		timeout: 10000,
	})
}

function isPortAvailable(port: number) {
	return new Promise(resolve => {
		const server = net.createServer()
		server.unref()
		server.on('error', () => resolve(false))

		server.listen(port, () => {
			server.close(() => {
				resolve(true)
			})
		})
	})
}

export function isRunning(app: App) {
	return devProcesses.has(app.name)
}

export function getProcesses() {
	return devProcesses
}

export async function closeProcess(key: string) {
	const proc = devProcesses.get(key)
	if (proc) {
		proc.process.kill()
		devProcesses.delete(key)
	}
}
