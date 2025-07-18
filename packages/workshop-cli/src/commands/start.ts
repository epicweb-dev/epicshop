import { spawn, type ChildProcess, execSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import chalk from 'chalk'
import closeWithGrace from 'close-with-grace'
import getPort from 'get-port'
import open from 'open'

export type StartOptions = {
	appLocation?: string
	verbose?: boolean
}

export type StartResult = {
	success: boolean
	message?: string
	error?: Error
}

/**
 * Start the workshop application
 */
export async function start(options: StartOptions = {}): Promise<StartResult> {
	try {
		// Find workshop-app directory using new resolution order
		const appDir = await findWorkshopAppDir(options.appLocation)
		if (!appDir) {
			console.error(chalk.red('❌ Could not locate workshop-app directory'))
			console.error(
				chalk.yellow(
					'Please ensure the workshop app is installed or specify its location using:',
				),
			)
			console.error(
				chalk.yellow('  - Environment variable: EPICSHOP_APP_LOCATION'),
			)
			console.error(chalk.yellow('  - Command line flag: --app-location'))
			console.error(
				chalk.yellow(
					'  - Global installation: npm install -g @epic-web/workshop-app',
				),
			)
			process.exit(1)
		}

		const isPublished = await appIsPublished(appDir)
		const isProd = process.env.NODE_ENV === 'production' || isPublished
		const isDeployed =
			process.env.EPICSHOP_DEPLOYED === 'true' ||
			process.env.EPICSHOP_DEPLOYED === '1'

		const parentPort = await getPort({ port: 3742 })
		const parentToken = crypto.randomBytes(32).toString('hex')
		const sentryImport =
			isPublished && process.env.SENTRY_DSN
				? `--import="${appDir}/instrument.js"`
				: ''

		const childCommand = isProd
			? `node ${sentryImport} ./start.js`
			: `node ${sentryImport} ./server/dev-server.js`

		const EPICSHOP_CONTEXT_CWD = await getEpicshopContextCwd()
		const childEnv: NodeJS.ProcessEnv = {
			...process.env,
			EPICSHOP_CONTEXT_CWD: EPICSHOP_CONTEXT_CWD,
			EPICSHOP_PARENT_PORT: String(parentPort),
			EPICSHOP_PARENT_TOKEN: parentToken,
			EPICSHOP_APP_LOCATION: appDir,
		}
		if (isProd) childEnv.NODE_ENV = 'production'

		let server: http.Server | null = null
		let child: ChildProcess | null = null
		let restarting = false
		let childPort: number | null = null
		let childPortPromiseResolve: ((port: number) => void) | null = null

		// Check for updates on startup
		async function checkAndDisplayUpdates() {
			if (isDeployed) return

			try {
				const { checkForUpdatesCached } = await import(
					'@epic-web/workshop-utils/git.server'
				)
				const { getMutedNotifications } = await import(
					'@epic-web/workshop-utils/db.server'
				)

				const updates = await checkForUpdatesCached()
				if (updates.updatesAvailable && updates.remoteCommit) {
					// Check if update notification is muted
					const mutedNotifications = await getMutedNotifications()
					const updateNotificationId = `update-repo-${updates.remoteCommit}`

					if (!mutedNotifications.includes(updateNotificationId)) {
						const updateCommand = chalk.blue.bold.bgWhite(
							' npx update-epic-workshop ',
						)
						const updateLink = chalk.blue.bgWhite(` ${updates.diffLink} `)
						console.log(
							'\n',
							`🎉  There are ${chalk.yellow(
								'updates available',
							)} for this workshop repository.  🎉\n\nTo get the updates, ${chalk.green.bold.bgWhite(
								`press the "u" key`,
							)} or stop the server and run the following command:\n\n  ${updateCommand}\n\nTo view a diff, check:\n  ${updateLink}\n\nTo dismiss this notification, ${chalk.red.bold.bgWhite(
								`press the "d" key`,
							)}\n`,
						)
					}
				}
			} catch {
				// Silently ignore update check errors
			}
		}

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
			const { getWorkshopUrl } = await import(
				'@epic-web/workshop-utils/config.server'
			)
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
						const port = await childPortPromise
						const { getWorkshopUrl } = await import(
							'@epic-web/workshop-utils/config.server'
						)
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

			child = spawn(childCommand, [], {
				shell: true,
				cwd: appDir,
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
		void checkAndDisplayUpdates()

		const supportedKeys = [
			`${chalk.blue('o')} - open workshop app`,
			`${chalk.green('u')} - update workshop`,
			`${chalk.magenta('r')} - restart workshop app`,
			`${chalk.cyan('k')} - Kody kudos 🐨`,
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
						const { getWorkshopUrl } = await import(
							'@epic-web/workshop-utils/config.server'
						)
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
						const { checkForUpdatesCached } = await import(
							'@epic-web/workshop-utils/git.server'
						)
						const { muteNotification } = await import(
							'@epic-web/workshop-utils/db.server'
						)
						const updates = await checkForUpdatesCached()
						if (updates.updatesAvailable && updates.remoteCommit) {
							const updateNotificationId = `update-repo-${updates.remoteCommit}`
							await muteNotification(updateNotificationId)
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
				} else if (key === '\u0003') {
					// Ctrl+C
					await cleanupBeforeExit()
					process.exit(0)
				} else {
					// Forward unhandled keys to child process stdin
					if (child?.stdin && !child.stdin.destroyed) {
						child.stdin.write(key)
					}
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
		const onExit = () => resolve()
		child.once('exit', onExit)
		child.kill()
	})
}

async function findWorkshopAppDir(
	appLocation?: string,
): Promise<string | null> {
	// 1. Check process.env.EPICSHOP_APP_LOCATION
	if (process.env.EPICSHOP_APP_LOCATION) {
		const envDir = path.resolve(process.env.EPICSHOP_APP_LOCATION)
		try {
			await fs.promises.access(path.join(envDir, 'package.json'))
			return envDir
		} catch {
			// Continue to next step
		}
	}

	// 2. Check command line flag --app-location
	if (appLocation) {
		const flagDir = path.resolve(appLocation)
		try {
			await fs.promises.access(path.join(flagDir, 'package.json'))
			return flagDir
		} catch {
			// Continue to next step
		}
	}

	// 3. Node's resolution process
	try {
		const workshopAppPath = import.meta.resolve(
			'@epic-web/workshop-app/package.json',
		)
		const packagePath = fileURLToPath(workshopAppPath)
		return path.dirname(packagePath)
	} catch {
		// Continue to next step
	}

	// 4. Global installation lookup
	try {
		const globalDir = await findGlobalWorkshopApp()
		if (globalDir) {
			return globalDir
		}
	} catch {
		// Continue to next step
	}

	// Fallback for development (when running from a monorepo)
	try {
		const cliPkgPath = import.meta.resolve(
			'@epic-web/workshop-cli/package.json',
		)
		const cliPkgDir = path.dirname(fileURLToPath(cliPkgPath))
		const relativePath = path.resolve(cliPkgDir, '../workshop-app')
		try {
			await fs.promises.access(path.join(relativePath, 'package.json'))
			return relativePath
		} catch {
			// Continue to final return
		}
	} catch {
		// Continue to final return
	}

	return null
}

async function findGlobalWorkshopApp(): Promise<string | null> {
	// Try to find globally installed workshop app
	try {
		const npmRoot = execSync('npm root -g', { encoding: 'utf-8' }).trim()
		const globalAppPath = path.join(npmRoot, '@epic-web/workshop-app')
		try {
			await fs.promises.access(path.join(globalAppPath, 'package.json'))
			return globalAppPath
		} catch {
			// Continue to common global locations
		}
	} catch {
		// If npm root -g fails, try common global locations
	}

	// Try common global locations
	const commonGlobalPaths = [
		path.join(
			os.homedir(),
			'.npm-global/lib/node_modules/@epic-web/workshop-app',
		),
		path.join(
			os.homedir(),
			'.npm-packages/lib/node_modules/@epic-web/workshop-app',
		),
		'/usr/local/lib/node_modules/@epic-web/workshop-app',
		'/usr/lib/node_modules/@epic-web/workshop-app',
	]

	for (const globalPath of commonGlobalPaths) {
		try {
			await fs.promises.access(path.join(globalPath, 'package.json'))
			return globalPath
		} catch {
			// Continue to next path
		}
	}

	return null
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

async function getEpicshopContextCwd(): Promise<string> {
	if (process.env.EPICSHOP_CONTEXT_CWD) {
		return process.env.EPICSHOP_CONTEXT_CWD
	}
	let dir = process.cwd()
	while (true) {
		const pkgPath = path.join(dir, 'package.json')
		try {
			const pkgRaw = await fs.promises.readFile(pkgPath, 'utf8')
			const pkg = JSON.parse(pkgRaw) as { epicshop?: boolean }
			if (pkg.epicshop) {
				return dir
			}
		} catch {}
		const parentDir = path.dirname(dir)
		if (parentDir === dir) break
		dir = parentDir
	}
	return process.cwd()
}
