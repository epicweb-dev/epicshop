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
import { z } from 'zod'
import { 
	loginTool, 
	logoutTool, 
	setPlaygroundTool, 
	updateProgressTool,
	loginSchema,
	logoutSchema,
	setPlaygroundSchema,
	updateProgressSchema,
} from './tools.js'
import { 
	getWorkshopContext, 
	getExerciseContext, 
	getDiffBetweenApps, 
	getExerciseStepProgressDiff, 
	getUserInfoResource, 
	getUserAccessResource, 
	getUserProgressResource,
	getWorkshopContextSchema,
	getExerciseContextSchema,
	getDiffBetweenAppsSchema,
	getExerciseStepProgressDiffSchema,
	getUserInfoSchema,
	getUserAccessSchema,
	getUserProgressSchema,
} from './resources.js'
import { 
	quizMe, 
	quizMeSchema 
} from './prompts.js'

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
	const EPICSHOP_CONTEXT_CWD = await getEpicshopContextCwd()
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

function findWorkshopAppDir(): string | null {
	try {
		// Use Node's resolution algorithm to find the workshop-app package
		const workshopAppPath = import.meta.resolve(
			'@epic-web/workshop-app/package.json',
		)
		const packagePath = fileURLToPath(workshopAppPath)
		return path.dirname(packagePath)
	} catch {
		const cliPkgPath = import.meta.resolve(
			'@epic-web/workshop-cli/package.json',
		)
		const cliPkgDir = path.dirname(fileURLToPath(cliPkgPath))
		// Fallback to relative path resolution for development
		const relativePath = path.resolve(cliPkgDir, '../workshop-app')
		if (fs.existsSync(path.join(relativePath, 'package.json'))) {
			return relativePath
		}
	}

	return null
}

function isPublished(appDir: string): boolean {
	return !fs.existsSync(path.join(appDir, 'app'))
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
			const pkg = JSON.parse(pkgRaw) as any
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

// Helper function to validate and parse CLI arguments
function validateAndParseArgs<T extends z.ZodSchema>(
	schema: T,
	args: unknown,
): z.infer<T> {
	const result = schema.safeParse(args)
	if (!result.success) {
		console.error(chalk.red('❌ Invalid arguments:'))
		console.error(result.error.format())
		process.exit(1)
	}
	return result.data
}

// Helper function to output JSON results
function outputResult(result: any, format: 'json' | 'pretty' = 'pretty') {
	if (format === 'json') {
		console.log(JSON.stringify(result, null, 0))
	} else {
		console.log(JSON.stringify(result, null, 2))
	}
}

const supportedKeys = [
	`${chalk.blue('o')} - open workshop app`,
	`${chalk.green('u')} - update workshop`,
	`${chalk.magenta('r')} - restart workshop app`,
	`${chalk.cyan('k')} - Kody kudos 🐨`,
	`${chalk.gray('q')} - exit (or ${chalk.gray('Ctrl+C')})`,
]

// Set up yargs CLI
const cli = yargs(hideBin(process.argv))
	.scriptName('epicshop')
	.usage('$0 <command> [options]')
	.help('help')
	.alias('h', 'help')
	.version(false)
	.option('workshop-dir', {
		alias: 'w',
		type: 'string',
		description: 'Workshop directory path',
		default: process.cwd(),
	})
	.option('format', {
		alias: 'f',
		type: 'string',
		choices: ['json', 'pretty'] as const,
		default: 'pretty' as const,
		description: 'Output format',
	})
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
	.command(
		'login',
		'Login to the workshop',
		(yargs: Argv) => {
			return yargs.example('$0 login', 'Login to the workshop')
		},
		async (argv: ArgumentsCamelCase<{ workshopDir?: string }>) => {
			const args = validateAndParseArgs(loginSchema, {
				workshopDirectory: path.resolve(argv.workshopDir || process.cwd()),
			})
			await loginTool(args)
		},
	)
	.command(
		'logout',
		'Logout from the workshop',
		(yargs: Argv) => {
			return yargs.example('$0 logout', 'Logout from the workshop')
		},
		async (argv: ArgumentsCamelCase<{ workshopDir?: string }>) => {
			const args = validateAndParseArgs(logoutSchema, {
				workshopDirectory: path.resolve(argv.workshopDir || process.cwd()),
			})
			await logoutTool(args)
		},
	)
	.command(
		'set-playground',
		'Set the playground environment',
		(yargs: Argv) => {
			return yargs
				.option('exercise', {
					alias: 'e',
					type: 'number',
					description: 'Exercise number',
				})
				.option('step', {
					alias: 's',
					type: 'number',
					description: 'Step number',
				})
				.option('type', {
					alias: 't',
					type: 'string',
					choices: ['problem', 'solution'],
					description: 'App type',
				})
				.example('$0 set-playground', 'Set to next exercise')
				.example('$0 set-playground -e 1 -s 2', 'Set to exercise 1, step 2')
				.example('$0 set-playground -t solution', 'Set to solution of current step')
		},
		async (argv: ArgumentsCamelCase<{ 
			workshopDir?: string
			exercise?: number
			step?: number
			type?: 'problem' | 'solution'
		}>) => {
			const args = validateAndParseArgs(setPlaygroundSchema, {
				workshopDirectory: path.resolve(argv.workshopDir || process.cwd()),
				exerciseNumber: argv.exercise,
				stepNumber: argv.step,
				type: argv.type,
			})
			await setPlaygroundTool(args)
		},
	)
	.command(
		'update-progress',
		'Update lesson progress',
		(yargs: Argv) => {
			return yargs
				.option('lesson-slug', {
					alias: 'l',
					type: 'string',
					description: 'Epic lesson slug',
					demandOption: true,
				})
				.option('complete', {
					alias: 'c',
					type: 'boolean',
					description: 'Mark as complete',
					default: true,
				})
				.example('$0 update-progress -l lesson-slug', 'Mark lesson as complete')
		},
		async (argv: ArgumentsCamelCase<{ 
			workshopDir?: string
			lessonSlug?: string
			complete?: boolean
		}>) => {
			const args = validateAndParseArgs(updateProgressSchema, {
				workshopDirectory: path.resolve(argv.workshopDir || process.cwd()),
				epicLessonSlug: argv.lessonSlug,
				complete: argv.complete,
			})
			await updateProgressTool(args)
		},
	)
	.command(
		'get-workshop-context',
		'Get workshop context information',
		(yargs: Argv) => {
			return yargs.example('$0 get-workshop-context', 'Get workshop context')
		},
		async (argv: ArgumentsCamelCase<{ workshopDir?: string; format?: 'json' | 'pretty' }>) => {
			const args = validateAndParseArgs(getWorkshopContextSchema, {
				workshopDirectory: path.resolve(argv.workshopDir || process.cwd()),
			})
			const result = await getWorkshopContext(args)
			outputResult(result, argv.format)
		},
	)
	.command(
		'get-exercise-context',
		'Get exercise context information',
		(yargs: Argv) => {
			return yargs
				.option('exercise', {
					alias: 'e',
					type: 'number',
					description: 'Exercise number',
				})
				.example('$0 get-exercise-context', 'Get current exercise context')
				.example('$0 get-exercise-context -e 3', 'Get exercise 3 context')
		},
		async (argv: ArgumentsCamelCase<{ 
			workshopDir?: string
			exercise?: number
			format?: 'json' | 'pretty'
		}>) => {
			const args = validateAndParseArgs(getExerciseContextSchema, {
				workshopDirectory: path.resolve(argv.workshopDir || process.cwd()),
				exerciseNumber: argv.exercise,
			})
			const result = await getExerciseContext(args)
			outputResult(result, argv.format)
		},
	)
	.command(
		'get-diff',
		'Get diff between two apps',
		(yargs: Argv) => {
			return yargs
				.option('app1', {
					type: 'string',
					description: 'First app ID (e.g., "01.01.problem")',
					demandOption: true,
				})
				.option('app2', {
					type: 'string',
					description: 'Second app ID (e.g., "01.01.solution")',
					demandOption: true,
				})
				.example('$0 get-diff --app1 01.01.problem --app2 01.01.solution', 'Get diff between apps')
		},
		async (argv: ArgumentsCamelCase<{ 
			workshopDir?: string
			app1?: string
			app2?: string
			format?: 'json' | 'pretty'
		}>) => {
			const args = validateAndParseArgs(getDiffBetweenAppsSchema, {
				workshopDirectory: path.resolve(argv.workshopDir || process.cwd()),
				app1: argv.app1,
				app2: argv.app2,
			})
			const result = await getDiffBetweenApps(args)
			outputResult(result, argv.format)
		},
	)
	.command(
		'get-progress-diff',
		'Get progress diff for current exercise step',
		(yargs: Argv) => {
			return yargs.example('$0 get-progress-diff', 'Get progress diff')
		},
		async (argv: ArgumentsCamelCase<{ workshopDir?: string; format?: 'json' | 'pretty' }>) => {
			const args = validateAndParseArgs(getExerciseStepProgressDiffSchema, {
				workshopDirectory: path.resolve(argv.workshopDir || process.cwd()),
			})
			const result = await getExerciseStepProgressDiff(args)
			outputResult(result, argv.format)
		},
	)
	.command(
		'get-user-info',
		'Get user information',
		(yargs: Argv) => {
			return yargs.example('$0 get-user-info', 'Get user information')
		},
		async (argv: ArgumentsCamelCase<{ workshopDir?: string; format?: 'json' | 'pretty' }>) => {
			const args = validateAndParseArgs(getUserInfoSchema, {
				workshopDirectory: path.resolve(argv.workshopDir || process.cwd()),
			})
			const result = await getUserInfoResource(args)
			outputResult(result, argv.format)
		},
	)
	.command(
		'get-user-access',
		'Get user access information',
		(yargs: Argv) => {
			return yargs.example('$0 get-user-access', 'Get user access information')
		},
		async (argv: ArgumentsCamelCase<{ workshopDir?: string; format?: 'json' | 'pretty' }>) => {
			const args = validateAndParseArgs(getUserAccessSchema, {
				workshopDirectory: path.resolve(argv.workshopDir || process.cwd()),
			})
			const result = await getUserAccessResource(args)
			outputResult(result, argv.format)
		},
	)
	.command(
		'get-user-progress',
		'Get user progress information',
		(yargs: Argv) => {
			return yargs.example('$0 get-user-progress', 'Get user progress information')
		},
		async (argv: ArgumentsCamelCase<{ workshopDir?: string; format?: 'json' | 'pretty' }>) => {
			const args = validateAndParseArgs(getUserProgressSchema, {
				workshopDirectory: path.resolve(argv.workshopDir || process.cwd()),
			})
			const result = await getUserProgressResource(args)
			outputResult(result, argv.format)
		},
	)
	.command(
		'quiz-me',
		'Generate a quiz for an exercise',
		(yargs: Argv) => {
			return yargs
				.option('exercise', {
					alias: 'e',
					type: 'string',
					description: 'Exercise number to quiz on',
				})
				.example('$0 quiz-me', 'Get a quiz for a random exercise')
				.example('$0 quiz-me -e 3', 'Get a quiz for exercise 3')
		},
		async (argv: ArgumentsCamelCase<{ 
			workshopDir?: string
			exercise?: string
			format?: 'json' | 'pretty'
		}>) => {
			const args = validateAndParseArgs(quizMeSchema, {
				workshopDirectory: path.resolve(argv.workshopDir || process.cwd()),
				exerciseNumber: argv.exercise,
			})
			const result = await quizMe(args)
			outputResult(result, argv.format)
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
