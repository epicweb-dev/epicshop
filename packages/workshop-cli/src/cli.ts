#!/usr/bin/env node

import { spawn, type ChildProcess } from 'child_process'
import crypto from 'crypto'
import fs from 'fs'
import http from 'http'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'
import chalk from 'chalk'
import closeWithGrace from 'close-with-grace'
import getPort from 'get-port'
import open from 'open'
import yargs, { type ArgumentsCamelCase, type Argv } from 'yargs'
import { hideBin } from 'yargs/helpers'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function startCommand() {
	// Find workshop-app directory - need to locate it relative to CLI
	const appDir = findWorkshopAppDir()
	if (!appDir) {
		console.error(chalk.red('❌ Could not locate workshop-app directory'))
		process.exit(1)
	}

	const isProd = process.env.NODE_ENV === 'production' || isPublished(appDir)
	const isDeployed =
		process.env.EPICSHOP_DEPLOYED === 'true' ||
		process.env.EPICSHOP_DEPLOYED === '1'

	const parentPort = await getPort({ port: 3742 })
	const parentToken = crypto.randomBytes(32).toString('hex')

	const childCommand = isProd ? 'node ./start.js' : 'npm run dev'
	const EPICSHOP_CONTEXT_CWD = process.env.EPICSHOP_CONTEXT_CWD ?? process.cwd()
	const childEnv: NodeJS.ProcessEnv = {
		...process.env,
		EPICSHOP_CONTEXT_CWD: EPICSHOP_CONTEXT_CWD,
		EPICSHOP_PARENT_PORT: String(parentPort),
		EPICSHOP_PARENT_TOKEN: parentToken,
	}
	if (isProd) childEnv.NODE_ENV = 'production'

	let server: http.Server | null = null
	let child: ChildProcess | null = null
	let restarting = false
	let childPort: number | null = null
	let childPortPromiseResolve: ((port: number) => void) | null = null
	const childPortPromise = new Promise<number>((resolve) => {
		childPortPromiseResolve = resolve
	}).then((port) => {
		childPort = port
		return port
	})

	function parsePortFromLine(line: string): number | null {
		const match = line.match(/localhost:(\d+)/)
		if (match) {
			return Number(match[1])
		}
		return null
	}

	async function waitForChildReady(): Promise<boolean> {
		const port = await childPortPromise
		const url = `http://localhost:${port}/`
		const maxAttempts = 40 // 20s max (500ms interval)
		for (let i = 0; i < maxAttempts; i++) {
			try {
				const res = await fetch(url, { method: 'GET' })
				if (res.ok) return true
			} catch {}
			await new Promise((r) => setTimeout(r, 500))
		}
		return false
	}

	async function doUpdateAndRestart(): Promise<boolean> {
		console.log('\n👀 Checking for updates...')
		try {
			// Import the git update functionality
			const { updateLocalRepo } = await import(
				'@epic-web/workshop-utils/git.server'
			)
			const result = await updateLocalRepo()
			if (result.status === 'success') {
				console.log(`✅ ${result.message}`)
				console.log('\n🔄 Restarting...')
				restarting = true
				await killChild(child)
				restarting = false
				spawnChild()
				const ready = await waitForChildReady()
				return ready
			} else {
				console.error(`❌ ${result.message}`)
				console.error(
					'Update failed. Please try again or see the repo for manual setup.',
				)
				return false
			}
		} catch (error) {
			console.error('❌ Update functionality not available:', error)
			return false
		}
	}

	if (!isDeployed) {
		server = http.createServer(async (req, res) => {
			try {
				if (req.url === '/__epicshop-restart') {
					const port = await childPort
					res.setHeader(
						'Access-Control-Allow-Origin',
						`http://localhost:${port}`,
					)
					res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
					res.setHeader(
						'Access-Control-Allow-Headers',
						'x-epicshop-token, content-type',
					)
					res.setHeader('Access-Control-Max-Age', '86400')

					// Handle preflight OPTIONS request
					if (req.method === 'OPTIONS') {
						res.statusCode = 204
						res.end()
						return
					}
					if (req.method === 'POST') {
						res.setHeader('Content-Type', 'application/json')
						const token = req.headers['x-epicshop-token']
						if (token !== parentToken) {
							res.statusCode = 403
							res.end(JSON.stringify({ status: 'error', message: 'Forbidden' }))
							return
						}
						console.log(
							'\n🔄 Update requested from web UI. Running update and restarting app process...',
						)
						const ready = await doUpdateAndRestart()
						if (ready) {
							res.statusCode = 200
							res.end(JSON.stringify({ status: 'ok' }))
						} else {
							res.statusCode = 500
							res.end(
								JSON.stringify({
									status: 'error',
									message: 'Restarted but not ready in time',
								}),
							)
						}
						return
					}
				}

				res.statusCode = 404
				res.end(JSON.stringify({ status: 'error', message: 'Not found' }))
				return
			} catch (error) {
				console.error(error)
				res.statusCode = 500
				res.end(
					JSON.stringify({ status: 'error', message: 'Internal server error' }),
				)
				return
			}
		})
		server.listen(parentPort, '127.0.0.1')
	}

	function spawnChild() {
		if (!appDir) return

		child = spawn(childCommand, [], {
			shell: true,
			cwd: EPICSHOP_CONTEXT_CWD,
			// Capture stdout for port detection
			stdio: ['pipe', 'pipe', 'inherit'],
			env: childEnv,
		})

		if (child.stdout) {
			child.stdout.on('data', (data: Buffer) => {
				process.stdout.write(data)
				if (!childPort) {
					const str = data.toString('utf8')
					const lines = str.split(/\r?\n/)
					for (const line of lines) {
						const port = parsePortFromLine(line)
						if (port) {
							childPortPromiseResolve?.(port)
						}
					}
				}
			})
		}
		child.on('exit', async (code: number | null) => {
			if (restarting) {
				restarting = false
			} else {
				if (server) await new Promise((resolve) => server!.close(resolve))
				process.exit(code ?? 0)
			}
		})
	}

	console.log(
		`🐨 Welcome to the workshop, ${chalk.bold.italic(os.userInfo().username)}!`,
	)

	spawnChild()

	if (process.stdin.isTTY && !isDeployed) {
		console.log(chalk.bold.cyan('Supported keys:'))
		console.log(`  ${supportedKeys.join('\n  ')}\n`)
		process.stdin.setRawMode(true)
		process.stdin.resume()
		process.stdin.setEncoding('utf8')
		process.stdin.on('data', async (key: string) => {
			if (key === 'u') {
				console.log(
					'\n🔄 Update requested from terminal. Running update and restarting app process...',
				)
				await doUpdateAndRestart()
			} else if (key === 'o') {
				if (childPort) {
					console.log(
						chalk.blue(
							`\n🌐 Opening browser to http://localhost:${childPort} ...`,
						),
					)
					await open(`http://localhost:${childPort}`)
				} else {
					console.log(chalk.red('Local server URL not available yet.'))
				}
			} else if (key === 'q') {
				console.log(chalk.yellow('\n👋 Exiting...'))
				await cleanupBeforeExit()
				process.exit(0)
			} else if (key === 'r') {
				console.log(chalk.magenta('\n🔄 Restarting app process...'))
				restarting = true
				await killChild(child)
				restarting = false
				spawnChild()
			} else if (key === 'k') {
				const messages = [
					'🐨 Kody says: You are koalafied for greatness!',
					'🐨 Kody says: Keep going, you are pawsome!',
					'🐨 Kody says: Eucalyptus up and code on!',
					'🐨 Kody says: You can do it, fur real!',
					'🐨 Kody says: Stay curious, stay cuddly!',
					"🐨 Kody says: Don't leaf your dreams behind!",
					'🐨 Kody says: Time to branch out and grow!',
					'🐨 Kody says: You are tree-mendous at this!',
					'🐨 Kody says: Leaf your worries behind!',
					'🐨 Kody says: You are absolutely koala-fied!',
					'🐨 Kody says: Keep climbing, you are doing great!',
				]
				const colors = [
					chalk.bgCyan.black,
					chalk.bgGreen.black,
					chalk.bgMagenta.white,
					chalk.bgYellow.black,
					chalk.bgBlue.white,
					chalk.bgRed.white,
				]
				const randomMessage =
					messages[Math.floor(Math.random() * messages.length)]!
				const randomColor = colors[Math.floor(Math.random() * colors.length)]!
				const msg = randomColor(randomMessage)
				console.log('\n' + msg + '\n')
			} else if (key === '\u0003') {
				// Ctrl+C
				await cleanupBeforeExit()
				process.exit(0)
			}
		})
	}

	async function cleanupBeforeExit() {
		if (process.platform === 'win32' && child?.pid) {
			spawn('taskkill', ['/pid', child.pid.toString(), '/f', '/t'])
		}
		await killChild(child)
		if (server) await new Promise((resolve) => server!.close(resolve))
	}

	closeWithGrace(cleanupBeforeExit)
}

async function updateCommand() {
	try {
		const { updateLocalRepo } = await import(
			'@epic-web/workshop-utils/git.server'
		)
		const result = await updateLocalRepo()
		if (result.status === 'success') {
			console.log(`✅ ${result.message}`)
		} else {
			console.error(`❌ ${result.message}`)
		}
	} catch (error) {
		console.error('❌ Update functionality not available:', error)
		process.exit(1)
	}
}

async function killChild(child: ChildProcess | null): Promise<void> {
	if (!child) return
	return new Promise((resolve) => {
		const onExit = () => resolve()
		child.once('exit', onExit)
		child.kill()
	})
}

const supportedKeys = [
	`${chalk.blue('o')} - open workshop app`,
	`${chalk.green('u')} - update workshop`,
	`${chalk.magenta('r')} - restart workshop app`,
	`${chalk.cyan('k')} - Kody kudos 🐨`,
	`${chalk.gray('q')} - exit (or ${chalk.gray('Ctrl+C')})`,
]

function findWorkshopAppDir(): string | null {
	try {
		// Use Node's resolution algorithm to find the workshop-app package
		const workshopAppPath = import.meta.resolve(
			'@epic-web/workshop-app/package.json',
		)
		const packagePath = fileURLToPath(workshopAppPath)
		return path.dirname(packagePath)
	} catch {
		// Fallback to relative path resolution for development
		const relativePath = path.resolve(__dirname, '../../../workshop-app')
		if (fs.existsSync(path.join(relativePath, 'package.json'))) {
			return relativePath
		}
	}

	return null
}

function isPublished(appDir: string): boolean {
	return !fs.existsSync(path.join(appDir, 'app'))
}

// Set up yargs CLI
const cli = yargs(hideBin(process.argv))
	.scriptName('epicshop')
	.usage('$0 <command> [options]')
	.help('help')
	.alias('h', 'help')
	.version(false)
	.command(
		['start', '$0'],
		'Start the workshop application',
		(yargs: Argv) => {
			return yargs
				.option('verbose', {
					alias: 'v',
					type: 'boolean',
					description: 'Show verbose output',
					default: false,
				})
				.example('$0 start', 'Start the workshop with interactive features')
		},
		async (_argv: ArgumentsCamelCase<{ verbose?: boolean }>) => {
			await startCommand()
		},
	)
	.command(
		['update', 'upgrade'],
		'Update the workshop to the latest version',
		(yargs: Argv) => {
			return yargs.example('$0 update', 'Update workshop to latest version')
		},
		async (_argv: ArgumentsCamelCase<Record<string, unknown>>) => {
			await updateCommand()
		},
	)
	.epilogue(
		`
${chalk.bold('Interactive keys (available during start command):')}
  ${supportedKeys.join('\n  ')}

For more information, visit: https://github.com/epicweb-dev/epicshop
`,
	)
	.strict()
	.demandCommand(0, 1, '', 'Too many commands specified')

// Parse and execute
await cli.parse()
