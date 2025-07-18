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
			return {
				success: false,
				message:
					'Could not locate workshop-app directory. Please ensure the workshop app is installed or specify its location.',
			}
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
								updates.updatesAvailable,
							)} update(s) available! Run ${updateCommand} to update.`,
						)
						console.log(`📖  View the changes: ${updateLink}`)
						console.log(
							`${chalk.gray('💡 Press')} ${chalk.blue('u')} ${chalk.gray(
								'to update or',
							)} ${chalk.blue('d')} ${chalk.gray('to dismiss this notification')}`,
						)
						console.log()
					}
				}
			} catch (error) {
				if (options.verbose) {
					console.error('Failed to check for updates:', error)
				}
			}
		}

		function spawnChild() {
			if (options.verbose) {
				console.log(chalk.blue(`🚀 Starting workshop app...`))
			}

			if (!appDir) {
				throw new Error('App directory not found')
			}

			child = spawn('sh', ['-c', childCommand], {
				cwd: appDir,
				env: childEnv,
				stdio: ['pipe', 'pipe', 'pipe'],
			})

			if (child?.stdout) {
				child.stdout.on('data', (data: Buffer) => {
					const output = data.toString()
					if (options.verbose) {
						process.stdout.write(output)
					}

					// Extract port from output
					const portMatch = output.match(/Local:\s+http:\/\/localhost:(\d+)/)
					if (portMatch && portMatch[1] && !childPort) {
						childPort = parseInt(portMatch[1], 10)
						if (childPortPromiseResolve) {
							childPortPromiseResolve(childPort)
							childPortPromiseResolve = null
						}
					}
				})
			}

			if (child?.stderr) {
				child.stderr.on('data', (data: Buffer) => {
					if (options.verbose) {
						process.stderr.write(data.toString())
					}
				})
			}

			child?.on('exit', (code, signal) => {
				if (options.verbose) {
					console.log(
						chalk.yellow(
							`Workshop app exited with code ${code} and signal ${signal}`,
						),
					)
				}
				if (!restarting) {
					process.exit(code || 0)
				}
			})
		}

		// Start the child process
		spawnChild()

		// Check for updates after starting
		await checkAndDisplayUpdates()

		// Create parent server for communication
		server = http.createServer((req, res) => {
			if (
				req.url === '/ping' &&
				req.headers.authorization === `Bearer ${parentToken}`
			) {
				res.writeHead(200, { 'Content-Type': 'application/json' })
				res.end(JSON.stringify({ status: 'ok' }))
			} else {
				res.writeHead(404)
				res.end()
			}
		})

		server.listen(parentPort, () => {
			if (options.verbose) {
				console.log(
					chalk.green(`✅ Parent server listening on port ${parentPort}`),
				)
			}
		})

		// Cleanup function
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
