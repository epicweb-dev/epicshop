// oxlint-disable-next-line import/order -- must appear first
import { getEnv } from '@epic-web/workshop-utils/init-env'

import { spawn, type ChildProcess } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import chalk from 'chalk'
import closeWithGrace from 'close-with-grace'
import getPort from 'get-port'
import open from 'open'
import {
	buildWorkshopAppNotFoundMessage,
	resolveWorkshopAppLocation,
} from './workshop-app-location.ts'

export type StartOptions = {
	appLocation?: string
	verbose?: boolean
	silent?: boolean
}

export type StartResult = {
	success: boolean
	message?: string
	error?: Error
}

/**
 * Display help information about environment variables and debug logging
 */
export function displayHelp() {
	console.log('\n' + chalk.bold.cyan('📚 Epic Workshop Help\n'))
	console.log(chalk.bold('Environment Variables:'))
	const envVar = (name: string, description: string) => {
		const value = process.env[name]
		const valueDisplay = value
			? chalk.gray(` (current: ${value})`)
			: chalk.gray(' (not set)')
		return '  ' + chalk.cyan(name) + ' - ' + description + valueDisplay
	}
	console.log(
		envVar(
			'EPICSHOP_APP_LOCATION',
			'Path to the `@epic-web/workshop-app` directory',
		),
	)
	console.log(
		envVar(
			'EPICSHOP_DEPLOYED',
			'Set to "true" or "1" for deployed environments',
		),
	)
	console.log(
		envVar(
			'EPICSHOP_IS_PUBLISHED',
			'Set to "true" or "1" for published builds',
		),
	)
	console.log(envVar('EPICSHOP_GITHUB_REPO', 'GitHub repository URL'))
	console.log(envVar('EPICSHOP_CONTEXT_CWD', 'Working directory context'))
	console.log(envVar('NODE_ENV', 'Set to "production" for production mode'))
	console.log(
		envVar('NODE_DEBUG', 'Enable debug logging (see Debug Logging below)') +
			'\n',
	)

	console.log(chalk.bold('Debug Logging:'))
	console.log(
		'  Enable detailed logging using the ' +
			chalk.cyan('NODE_DEBUG') +
			' environment variable:',
	)
	console.log(
		'  ' +
			chalk.gray('NODE_DEBUG=epic:api') +
			' - API operations (video info, progress, workshop data)',
	)
	console.log(
		'  ' + chalk.gray('NODE_DEBUG=epic:cache:*') + ' - All cache operations',
	)
	console.log('  ' + chalk.gray('NODE_DEBUG=epic:req') + ' - Request logging')
	console.log(
		'  ' + chalk.gray('NODE_DEBUG=epic:auth') + ' - Authentication operations',
	)
	console.log('  ' + chalk.gray('NODE_DEBUG=epic:*') + ' - All epic logging\n')

	console.log(chalk.bold('Examples:'))
	console.log(
		'  ' +
			chalk.gray('NODE_DEBUG=epic:api npm run dev') +
			' - Enable API debugging',
	)
	console.log(
		'  ' +
			chalk.gray('NODE_DEBUG=epic:cache:*,epic:api npm run dev') +
			' - Enable multiple namespaces\n',
	)

	console.log(chalk.bold('For more information:'))
	console.log(
		'  ' +
			chalk.blue.underline(
				'https://github.com/epicweb-dev/epicshop/tree/main/docs',
			) +
			'\n',
	)
}

/**
 * Start the workshop application
 */
export async function start(options: StartOptions = {}): Promise<StartResult> {
	try {
		const resolution = await resolveWorkshopAppLocation({
			appLocation: options.appLocation,
		})
		const appDir = resolution.appDir
		if (!appDir) {
			const errorMessage = buildWorkshopAppNotFoundMessage(resolution)

			return {
				success: false,
				message: errorMessage,
				error: new Error(errorMessage),
			}
		}

		const isPublished = await appIsPublished(appDir)
		const isProd = process.env.NODE_ENV === 'production' || isPublished
		const isDeployed =
			process.env.EPICSHOP_DEPLOYED === 'true' ||
			process.env.EPICSHOP_DEPLOYED === '1'

		const parentPort = await getPort({ port: 3742 })
		const parentToken = crypto.randomBytes(32).toString('hex')
		const instrumentModule = pathToFileURL(path.join(appDir, 'instrument.js'))
		const sentryImport =
			isPublished && process.env.SENTRY_DSN
				? `--import=${instrumentModule.href}`
				: null
		const childScript = isProd ? './start.js' : './server/dev-server.js'

		const childEnv: NodeJS.ProcessEnv = {
			TERM: 'xterm-256color',
			FORCE_COLOR: '1',
			COLORTERM: 'truecolor',
			...process.env,
			EPICSHOP_CONTEXT_CWD: getEnv().EPICSHOP_CONTEXT_CWD,
			EPICSHOP_GITHUB_REPO: getEnv().EPICSHOP_GITHUB_REPO,
			EPICSHOP_PARENT_PORT: String(parentPort),
			EPICSHOP_PARENT_TOKEN: parentToken,
			EPICSHOP_APP_LOCATION: appDir,
		}
		if (isProd) childEnv.NODE_ENV = 'production'

		let server: http.Server | null = null
		let child: ChildProcess | null = null
		let restarting = false
		let childWasKilled = false
		let childPort: number | null = null
		let childPortPromiseResolve: ((port: number) => void) | null = null
		let childPortPromise: Promise<number>

		// Function to create a new port promise
		function createChildPortPromise(): Promise<number> {
			return new Promise<number>((resolve) => {
				childPortPromiseResolve = resolve
			}).then((port) => {
				childPort = port
				return port
			})
		}

		// Check for updates on startup
		async function checkAndDisplayUpdates() {
			if (isDeployed) return

			try {
				const { checkForUpdatesCached } =
					await import('@epic-web/workshop-utils/git.server')
				const { getMutedNotifications } =
					await import('@epic-web/workshop-utils/db.server')

				const updates = (await checkForUpdatesCached()) as {
					updatesAvailable: boolean
					diffLink: string | null
					updateNotificationId?: string | null
					repoUpdatesAvailable?: boolean
					dependenciesNeedInstall?: boolean
				}
				const updateNotificationId = updates.updateNotificationId ?? null
				const repoUpdatesAvailable =
					updates.repoUpdatesAvailable ?? updates.updatesAvailable
				const dependenciesNeedInstall = updates.dependenciesNeedInstall ?? false

				if (!updates.updatesAvailable || !updateNotificationId) {
					return
				}

				// Check if update notification is muted
				const mutedNotifications = await getMutedNotifications()
				if (mutedNotifications.includes(updateNotificationId)) {
					return
				}

				const updateLink =
					repoUpdatesAvailable && updates.diffLink
						? chalk.blue.bgWhite(` ${updates.diffLink} `)
						: null
				const headline = repoUpdatesAvailable
					? `🎉  There are ${chalk.yellow('updates available')} for this workshop repository.  🎉`
					: `📦  ${chalk.yellow('Dependencies are out of date')} for this workshop repository.  📦`
				const lines = [headline]

				if (dependenciesNeedInstall) {
					lines.push(
						`Your installed packages don't match ${chalk.cyan(
							'package.json',
						)}.`,
					)
				}

				lines.push(
					repoUpdatesAvailable
						? `To get the updates${dependenciesNeedInstall ? ' and reinstall dependencies' : ''}, ${chalk.green.bold.bgWhite(
								`press the "u" key`,
							)}`
						: `To reinstall dependencies, ${chalk.green.bold.bgWhite(
								`press the "u" key`,
							)}`,
				)

				if (updateLink) {
					lines.push(`To view a diff, check:\n  ${updateLink}`)
				}

				lines.push(
					`To dismiss this notification, ${chalk.red.bold.bgWhite(
						`press the "d" key`,
					)}`,
				)

				console.log('\n', `${lines.join('\n\n')}\n`)
			} catch {
				// Silently ignore update check errors
			}
		}

		// Initialize the child port promise
		childPortPromise = createChildPortPromise()

		function parsePortFromLine(line: string): number | null {
			const match = line.match(/localhost:(\d+)/)
			if (match) {
				return Number(match[1])
			}
			return null
		}

		async function waitForChildReady(): Promise<boolean> {
			const port = await childPortPromise
			const { getWorkshopUrl } =
				await import('@epic-web/workshop-utils/config.server')
			const url = getWorkshopUrl(port)
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
			if (isDeployed) {
				console.log('❌ Updates are not available in deployed environments.')
				return false
			}

			console.log('\n👀 Checking for updates...')
			try {
				const { updateLocalRepo } =
					await import('@epic-web/workshop-utils/git.server')

				// Kill child FIRST to release file handles (prevents EBUSY on Windows)
				console.log('🛑 Stopping app for update...')
				restarting = true
				childWasKilled = true
				await killChild(child)

				// Now run the update (npm install won't hit file locks)
				const result = await updateLocalRepo()

				if (result.status === 'success') {
					console.log(`✅ ${result.message}`)
					console.log('\n🔄 Restarting...')
					spawnChild()
					restarting = false
					const ready = await waitForChildReady()
					return ready
				} else {
					console.error(`❌ ${result.message}`)
					console.error('Update failed. Restarting app without updates...')
					spawnChild()
					restarting = false
					await waitForChildReady()
					return false
				}
			} catch (error) {
				console.error('❌ Update functionality not available:', error)
				// Restart app even if update failed
				if (!child || childWasKilled) {
					spawnChild()
					restarting = false
				}
				return false
			}
		}

		if (!isDeployed) {
			server = http.createServer(async (req, res) => {
				try {
					if (req.url === '/__epicshop-restart') {
						const port = await childPortPromise
						const { getWorkshopUrl } =
							await import('@epic-web/workshop-utils/config.server')
						const workshopUrl = getWorkshopUrl(port)
						res.setHeader('Access-Control-Allow-Origin', workshopUrl)
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
								res.end(
									JSON.stringify({ status: 'error', message: 'Forbidden' }),
								)
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
						JSON.stringify({
							status: 'error',
							message: 'Internal server error',
						}),
					)
					return
				}
			})
			server.listen(parentPort, '127.0.0.1')
		}

		function spawnChild() {
			if (!appDir) return

			// Reset port tracking when spawning a new child
			childPort = null
			childPortPromise = createChildPortPromise()

			const childArgs = [...(sentryImport ? [sentryImport] : []), childScript]
			child = spawn(process.execPath, childArgs, {
				cwd: appDir,
				// Capture stdout for port detection
				stdio: ['pipe', 'pipe', 'inherit'],
				env: childEnv,
			})

			// Reset flag only after spawn succeeds
			childWasKilled = false

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
					await new Promise((resolve) => server?.close(resolve))
					process.exit(code ?? 0)
				}
			})
		}

		console.log(
			`🐨 Welcome to the workshop, ${chalk.bold.italic(os.userInfo().username)}!`,
		)

		spawnChild()

		// Check for updates after starting
		void checkAndDisplayUpdates().catch(() => {})

		const supportedKeys = [
			`${chalk.blue('o')} - open workshop app`,
			`${chalk.green('u')} - update workshop`,
			`${chalk.magenta('r')} - restart workshop app`,
			`${chalk.cyan('k')} - Kody kudos 🐨`,
			`${chalk.yellow('h')} - help`,
			`${chalk.gray('q')} - exit (or ${chalk.gray('Ctrl+C')})`,
		]

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
						const { getWorkshopUrl } =
							await import('@epic-web/workshop-utils/config.server')
						const workshopUrl = getWorkshopUrl(childPort)
						console.log(
							chalk.blue(`\n🌐 Opening browser to ${workshopUrl} ...`),
						)
						await open(workshopUrl)
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
				} else if (key === 'd') {
					// Dismiss update notification
					try {
						const { checkForUpdatesCached } =
							await import('@epic-web/workshop-utils/git.server')
						const { muteNotification } =
							await import('@epic-web/workshop-utils/db.server')
						const updates = (await checkForUpdatesCached()) as {
							updatesAvailable: boolean
							updateNotificationId?: string | null
						}
						if (updates.updatesAvailable && updates.updateNotificationId) {
							await muteNotification(updates.updateNotificationId)
							console.log(
								chalk.green(
									'\n✅ Update notification dismissed permanently.\n',
								),
							)
						} else {
							console.log(
								chalk.yellow('\n⚠️  No update notifications to dismiss.\n'),
							)
						}
					} catch {
						console.log(
							chalk.red('\n❌ Failed to dismiss update notification.\n'),
						)
					}
				} else if (key === 'h') {
					displayHelp()
				} else if (key === '\u0003') {
					// Ctrl+C
					await cleanupBeforeExit()
					process.exit(0)
				} else if (key === '\r' || key === '\n') {
					// Enter key - add a newline to terminal output for visual separation
					process.stdout.write('\n')
				} else {
					// Forward unhandled keys to child process stdin
					if (child?.stdin && !child.stdin.destroyed) {
						child.stdin.write(key)
					}
				}
			})
		}

		async function cleanupBeforeExit() {
			await killChild(child)
			if (server) await new Promise((resolve) => server!.close(resolve))
		}

		closeWithGrace(cleanupBeforeExit)

		return {
			success: true,
			message: 'Workshop application started successfully',
		}
	} catch (error) {
		return {
			success: false,
			message: 'Failed to start workshop application',
			error: error instanceof Error ? error : new Error(String(error)),
		}
	}
}

// Helper functions

async function killChild(child: ChildProcess | null): Promise<void> {
	if (!child) return

	return new Promise((resolve) => {
		let timeoutId: NodeJS.Timeout | null = null

		const onExit = () => {
			if (timeoutId) {
				clearTimeout(timeoutId)
			}
			resolve()
		}
		child.once('exit', onExit)

		if (process.platform === 'win32') {
			// On Windows, use taskkill to kill the process tree
			if (child.pid) {
				const killer = spawn('taskkill', [
					'/pid',
					child.pid.toString(),
					'/f',
					'/t',
				])
				killer.on('exit', resolve)
				killer.on('error', resolve) // Resolve even if taskkill fails
			} else {
				child.kill()
				resolve()
			}
		} else {
			// On Unix-like systems, just kill the process normally
			child.kill('SIGTERM')

			// If it doesn't exit quickly, force kill and resolve
			timeoutId = setTimeout(() => {
				try {
					child.kill('SIGKILL')
				} catch {
					// Process might already be dead
				}
				resolve()
			}, 2500)
		}
	})
}

async function appIsPublished(appDir: string): Promise<boolean> {
	if (process.env.EPICSHOP_IS_PUBLISHED) {
		return (
			process.env.EPICSHOP_IS_PUBLISHED === 'true' ||
			process.env.EPICSHOP_IS_PUBLISHED === '1'
		)
	}
	try {
		await fs.promises.access(path.join(appDir, 'app'))
		return false
	} catch {
		return true
	}
}
