import '@epic-web/workshop-utils/init-env'

import { spawn } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import chalk from 'chalk'

const GITHUB_ORG = 'epicweb-dev'
const TUTORIAL_REPO = 'epicshop-tutorial'

export type WorkshopsResult = {
	success: boolean
	message?: string
	error?: Error
}

export type AddOptions = {
	repoName: string
	directory?: string
	silent?: boolean
}

export type StartOptions = {
	workshop?: string
	silent?: boolean
}

export type ConfigOptions = {
	reposDir?: string
	silent?: boolean
}

/**
 * Add a workshop by cloning from epicweb-dev GitHub org and running setup
 */
export async function add(options: AddOptions): Promise<WorkshopsResult> {
	const { repoName, silent = false } = options

	try {
		const { getReposDirectory, addWorkshop, workshopExists } = await import(
			'@epic-web/workshop-utils/workshops.server'
		)

		// Check if workshop already exists
		if (await workshopExists(repoName)) {
			const message = `Workshop "${repoName}" is already added`
			if (!silent) console.log(chalk.yellow(`⚠️  ${message}`))
			return { success: false, message }
		}

		// Get target directory
		const reposDir = options.directory || (await getReposDirectory())
		const workshopPath = path.join(reposDir, repoName)

		// Ensure the repos directory exists
		await fs.promises.mkdir(reposDir, { recursive: true })

		// Check if directory already exists
		try {
			await fs.promises.access(workshopPath)
			const message = `Directory already exists: ${workshopPath}`
			if (!silent) console.log(chalk.yellow(`⚠️  ${message}`))
			return { success: false, message }
		} catch {
			// Directory doesn't exist, which is what we want
		}

		const repoUrl = `https://github.com/${GITHUB_ORG}/${repoName}.git`

		if (!silent) {
			console.log(chalk.cyan(`📦 Cloning ${repoUrl}...`))
		}

		// Clone the repository
		const cloneResult = await runCommand(
			'git',
			['clone', repoUrl, workshopPath],
			{
				cwd: reposDir,
				silent,
			},
		)

		if (!cloneResult.success) {
			return {
				success: false,
				message: `Failed to clone repository: ${cloneResult.message}`,
				error: cloneResult.error,
			}
		}

		if (!silent) {
			console.log(chalk.cyan(`🔧 Running npm run setup...`))
		}

		// Run npm run setup
		const setupResult = await runCommand('npm', ['run', 'setup'], {
			cwd: workshopPath,
			silent,
		})

		if (!setupResult.success) {
			// Clean up the cloned directory on setup failure
			if (!silent) {
				console.log(chalk.yellow(`🧹 Cleaning up cloned directory...`))
			}
			try {
				await fs.promises.rm(workshopPath, { recursive: true, force: true })
			} catch {
				// Ignore cleanup errors
			}
			return {
				success: false,
				message: `Failed to run setup: ${setupResult.message}`,
				error: setupResult.error,
			}
		}

		// Try to get the workshop name from package.json
		let workshopName = repoName
		try {
			const pkgPath = path.join(workshopPath, 'package.json')
			const pkgContent = await fs.promises.readFile(pkgPath, 'utf8')
			const pkg = JSON.parse(pkgContent) as { name?: string }
			if (pkg.name) {
				workshopName = pkg.name
			}
		} catch {
			// Use repo name if package.json can't be read
		}

		// Add to our workshops database
		await addWorkshop({
			name: workshopName,
			repoName,
			path: workshopPath,
		})

		const message = `Workshop "${repoName}" added successfully at ${workshopPath}`
		if (!silent) {
			console.log(chalk.green(`✅ ${message}`))
		}

		return { success: true, message }
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		if (!silent) {
			console.error(chalk.red(`❌ ${message}`))
		}
		return {
			success: false,
			message,
			error: error instanceof Error ? error : new Error(message),
		}
	}
}

/**
 * List all added workshops
 */
export async function list({
	silent = false,
}: { silent?: boolean } = {}): Promise<WorkshopsResult> {
	try {
		const { listWorkshops, getReposDirectory } = await import(
			'@epic-web/workshop-utils/workshops.server'
		)

		const workshops = await listWorkshops()
		const reposDir = await getReposDirectory()

		if (workshops.length === 0) {
			const message = `No workshops added yet. Use 'epicshop workshops add <repo-name>' to add one.`
			if (!silent) {
				console.log(chalk.yellow(message))
				console.log(chalk.gray(`\nDefault repos directory: ${reposDir}`))
			}
			return { success: true, message }
		}

		if (!silent) {
			console.log(chalk.bold.cyan('\n📚 Your Workshops:\n'))
			for (const workshop of workshops) {
				const exists = await directoryExists(workshop.path)
				const status = exists
					? chalk.green('✓')
					: chalk.red('✗ (directory missing)')
				console.log(`  ${status} ${chalk.bold(workshop.name)}`)
				console.log(chalk.gray(`      Repo: ${workshop.repoName}`))
				console.log(chalk.gray(`      Path: ${workshop.path}`))
				console.log()
			}
			console.log(chalk.gray(`Repos directory: ${reposDir}\n`))
		}

		return {
			success: true,
			message: `Found ${workshops.length} workshop(s)`,
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		if (!silent) {
			console.error(chalk.red(`❌ ${message}`))
		}
		return {
			success: false,
			message,
			error: error instanceof Error ? error : new Error(message),
		}
	}
}

/**
 * Remove a workshop from the list (does not delete files)
 */
export async function remove({
	workshop,
	silent = false,
}: {
	workshop: string
	silent?: boolean
}): Promise<WorkshopsResult> {
	try {
		const { removeWorkshop, getWorkshop } = await import(
			'@epic-web/workshop-utils/workshops.server'
		)

		const workshopData = await getWorkshop(workshop)
		if (!workshopData) {
			const message = `Workshop "${workshop}" not found`
			if (!silent) console.log(chalk.yellow(`⚠️  ${message}`))
			return { success: false, message }
		}

		const removed = await removeWorkshop(workshop)
		if (removed) {
			const message = `Workshop "${workshopData.name}" removed from list (files at ${workshopData.path} were not deleted)`
			if (!silent) console.log(chalk.green(`✅ ${message}`))
			return { success: true, message }
		}

		const message = `Failed to remove workshop "${workshop}"`
		if (!silent) console.log(chalk.red(`❌ ${message}`))
		return { success: false, message }
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		if (!silent) {
			console.error(chalk.red(`❌ ${message}`))
		}
		return {
			success: false,
			message,
			error: error instanceof Error ? error : new Error(message),
		}
	}
}

/**
 * Start a workshop
 */
export async function startWorkshop(
	options: StartOptions = {},
): Promise<WorkshopsResult> {
	const { silent = false } = options

	try {
		const { listWorkshops, getWorkshop } = await import(
			'@epic-web/workshop-utils/workshops.server'
		)

		let workshopToStart

		// If workshop specified, look it up and fail if not found
		if (options.workshop) {
			workshopToStart = await getWorkshop(options.workshop)
			if (!workshopToStart) {
				const message = `Workshop "${options.workshop}" not found`
				if (!silent) console.log(chalk.yellow(`⚠️  ${message}`))
				return { success: false, message }
			}
		} else {
			// No workshop specified, show selection
			const workshops = await listWorkshops()

			if (workshops.length === 0) {
				const message = `No workshops added yet. Use 'epicshop workshops add <repo-name>' to add one.`
				if (!silent) console.log(chalk.yellow(message))
				return { success: false, message }
			}

			// Interactive selection
			const { select } = await import('@inquirer/prompts')

			const choices = workshops.map((w) => ({
				name: `${w.name} (${w.repoName})`,
				value: w,
				description: w.path,
			}))

			workshopToStart = await select({
				message: 'Select a workshop to start:',
				choices,
			})
		}

		if (!workshopToStart) {
			const message = 'No workshop selected'
			if (!silent) console.log(chalk.yellow(`⚠️  ${message}`))
			return { success: false, message }
		}

		// Check if the workshop directory exists
		if (!(await directoryExists(workshopToStart.path))) {
			const message = `Workshop directory not found: ${workshopToStart.path}`
			if (!silent) console.log(chalk.red(`❌ ${message}`))
			return { success: false, message }
		}

		if (!silent) {
			console.log(
				chalk.cyan(`🚀 Starting ${chalk.bold(workshopToStart.name)}...`),
			)
			console.log(chalk.gray(`   Path: ${workshopToStart.path}\n`))
		}

		// Run npm start in the workshop directory
		const startResult = await runCommandInteractive('npm', ['start'], {
			cwd: workshopToStart.path,
		})

		if (!startResult.success) {
			return {
				success: false,
				message: `Failed to start workshop: ${startResult.message}`,
				error: startResult.error,
			}
		}

		return { success: true, message: 'Workshop started' }
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		if (!silent) {
			console.error(chalk.red(`❌ ${message}`))
		}
		return {
			success: false,
			message,
			error: error instanceof Error ? error : new Error(message),
		}
	}
}

/**
 * Configure workshops settings
 */
export async function config(
	options: ConfigOptions = {},
): Promise<WorkshopsResult> {
	const { silent = false } = options

	try {
		const { getReposDirectory, setReposDirectory } = await import(
			'@epic-web/workshop-utils/workshops.server'
		)

		if (options.reposDir) {
			// Set the repos directory
			const resolvedPath = path.resolve(options.reposDir)
			await setReposDirectory(resolvedPath)
			const message = `Repos directory set to: ${resolvedPath}`
			if (!silent) console.log(chalk.green(`✅ ${message}`))
			return { success: true, message }
		}

		// Show current config
		const reposDir = await getReposDirectory()
		if (!silent) {
			console.log(chalk.bold.cyan('\n⚙️  Workshop Configuration:\n'))
			console.log(`  ${chalk.bold('Repos directory:')} ${reposDir}`)
			console.log()
			console.log(
				chalk.gray(
					"  Use 'epicshop workshops config --repos-dir <path>' to change",
				),
			)
			console.log()
		}

		return { success: true, message: `Repos directory: ${reposDir}` }
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		if (!silent) {
			console.error(chalk.red(`❌ ${message}`))
		}
		return {
			success: false,
			message,
			error: error instanceof Error ? error : new Error(message),
		}
	}
}

/**
 * Run the onboarding flow for new users
 */
export async function onboarding(): Promise<WorkshopsResult> {
	try {
		const {
			isReposDirectoryConfigured,
			getDefaultReposDir,
			setReposDirectory,
		} = await import('@epic-web/workshop-utils/workshops.server')

		// Check if already configured
		if (await isReposDirectoryConfigured()) {
			// Already configured, check for tutorial
			return await ensureTutorialAndStart()
		}

		// Welcome message
		console.log()
		console.log(
			chalk.bold.cyan("🎉 Welcome to EpicShop! Let's get you set up.\n"),
		)
		console.log(
			chalk.white(
				'EpicShop helps you manage and run EpicWeb workshops locally on your machine.',
			),
		)
		console.log(
			chalk.white(
				'Workshops are cloned from GitHub and stored in a directory of your choice.\n',
			),
		)

		// Prompt for directory configuration
		const { input, confirm } = await import('@inquirer/prompts')
		const defaultDir = getDefaultReposDir()

		console.log(chalk.gray(`We recommend: ${chalk.white(defaultDir)}\n`))

		const useDefault = await confirm({
			message: 'Use the recommended directory?',
			default: true,
		})

		let reposDir: string
		if (useDefault) {
			reposDir = defaultDir
		} else {
			reposDir = await input({
				message: 'Enter your preferred directory for workshops:',
				default: defaultDir,
				validate: (value) => {
					if (!value.trim()) {
						return 'Please enter a directory path'
					}
					return true
				},
			})
		}

		// Resolve and save the directory
		const resolvedPath = path.resolve(reposDir)
		await setReposDirectory(resolvedPath)

		console.log()
		console.log(
			chalk.green(`✅ Workshops directory set to: ${chalk.bold(resolvedPath)}`),
		)
		console.log()

		// Ensure directory exists
		await fs.promises.mkdir(resolvedPath, { recursive: true })

		// Now check for tutorial and start it
		return await ensureTutorialAndStart()
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		console.error(chalk.red(`❌ ${message}`))
		return {
			success: false,
			message,
			error: error instanceof Error ? error : new Error(message),
		}
	}
}

/**
 * Ensure the tutorial workshop exists and start it
 */
async function ensureTutorialAndStart(): Promise<WorkshopsResult> {
	const { workshopExists, getReposDirectory, addWorkshop } = await import(
		'@epic-web/workshop-utils/workshops.server'
	)

	// Check if tutorial already exists
	if (await workshopExists(TUTORIAL_REPO)) {
		// Tutorial already added, just start it
		return await startWorkshop({ workshop: TUTORIAL_REPO })
	}

	const reposDir = await getReposDirectory()
	const workshopPath = path.join(reposDir, TUTORIAL_REPO)
	const repoUrl = `https://github.com/${GITHUB_ORG}/${TUTORIAL_REPO}.git`

	console.log(
		chalk.cyan(`\n📚 Let's get you started with the EpicShop Tutorial!\n`),
	)
	console.log(
		chalk.white(`We'll clone the tutorial repository and set it up for you.\n`),
	)

	// Show the command we'll run
	const cloneCommand = `git clone ${repoUrl} ${workshopPath}`
	console.log(chalk.gray('Running:'))
	console.log(chalk.white.bold(`  ${cloneCommand}\n`))

	// Wait 2 seconds or 'g' to skip
	await waitWithSkip(2000, 'Press "g" to skip waiting...')

	console.log(chalk.cyan(`📦 Cloning ${TUTORIAL_REPO}...`))

	// Clone the repository
	const cloneResult = await runCommand(
		'git',
		['clone', repoUrl, workshopPath],
		{
			cwd: reposDir,
			silent: false,
		},
	)

	if (!cloneResult.success) {
		console.error(
			chalk.red(`❌ Failed to clone repository: ${cloneResult.message}`),
		)
		return {
			success: false,
			message: `Failed to clone repository: ${cloneResult.message}`,
			error: cloneResult.error,
		}
	}

	console.log(chalk.cyan(`\n🔧 Running npm run setup...\n`))

	// Run npm run setup
	const setupResult = await runCommand('npm', ['run', 'setup'], {
		cwd: workshopPath,
		silent: false,
	})

	if (!setupResult.success) {
		// Clean up on failure
		console.log(chalk.yellow(`🧹 Cleaning up cloned directory...`))
		try {
			await fs.promises.rm(workshopPath, { recursive: true, force: true })
		} catch {
			// Ignore cleanup errors
		}
		console.error(chalk.red(`❌ Failed to run setup: ${setupResult.message}`))
		return {
			success: false,
			message: `Failed to run setup: ${setupResult.message}`,
			error: setupResult.error,
		}
	}

	// Try to get the workshop name from package.json
	let workshopName = TUTORIAL_REPO
	try {
		const pkgPath = path.join(workshopPath, 'package.json')
		const pkgContent = await fs.promises.readFile(pkgPath, 'utf8')
		const pkg = JSON.parse(pkgContent) as { name?: string }
		if (pkg.name) {
			workshopName = pkg.name
		}
	} catch {
		// Use repo name if package.json can't be read
	}

	// Add to our workshops database
	await addWorkshop({
		name: workshopName,
		repoName: TUTORIAL_REPO,
		path: workshopPath,
	})

	console.log()
	console.log(
		chalk.green(
			`✅ ${chalk.bold(TUTORIAL_REPO)} has been set up successfully!\n`,
		),
	)

	// Show the command to start
	const startCommand = `epicshop workshops start ${TUTORIAL_REPO}`
	console.log(chalk.gray('To start the tutorial, you can run:'))
	console.log(chalk.white.bold(`  ${startCommand}\n`))

	// Wait 2 seconds or 'g' to skip
	await waitWithSkip(2000, 'Press "g" to skip waiting...')

	console.log(chalk.cyan(`🚀 Starting ${chalk.bold(workshopName)}...\n`))

	// Start the workshop
	const startResult = await runCommandInteractive('npm', ['start'], {
		cwd: workshopPath,
	})

	if (!startResult.success) {
		return {
			success: false,
			message: `Failed to start workshop: ${startResult.message}`,
			error: startResult.error,
		}
	}

	return { success: true, message: 'Tutorial started successfully' }
}

/**
 * Wait for a specified time, allowing user to press 'g' to skip
 */
async function waitWithSkip(ms: number, message: string): Promise<void> {
	return new Promise((resolve) => {
		console.log(chalk.gray(message))

		let resolved = false
		const timeout = setTimeout(() => {
			if (!resolved) {
				resolved = true
				cleanup()
				resolve()
			}
		}, ms)

		const cleanup = () => {
			if (process.stdin.isTTY) {
				process.stdin.setRawMode(false)
				process.stdin.removeListener('data', onData)
				process.stdin.pause()
			}
		}

		const onData = (key: Buffer) => {
			const char = key.toString()
			if (char.toLowerCase() === 'g' && !resolved) {
				resolved = true
				clearTimeout(timeout)
				cleanup()
				console.log(chalk.gray('Skipping wait...'))
				resolve()
			}
		}

		if (process.stdin.isTTY) {
			process.stdin.setRawMode(true)
			process.stdin.resume()
			process.stdin.once('data', onData)
		}
	})
}

// Helper functions

async function directoryExists(dirPath: string): Promise<boolean> {
	try {
		const stat = await fs.promises.stat(dirPath)
		return stat.isDirectory()
	} catch {
		return false
	}
}

type CommandResult = {
	success: boolean
	message?: string
	error?: Error
}

function runCommand(
	command: string,
	args: string[],
	options: { cwd: string; silent?: boolean },
): Promise<CommandResult> {
	return new Promise((resolve) => {
		const child = spawn(command, args, {
			cwd: options.cwd,
			stdio: options.silent ? 'pipe' : 'inherit',
		})

		child.on('error', (error) => {
			resolve({ success: false, message: error.message, error })
		})

		child.on('close', (code) => {
			if (code === 0) {
				resolve({ success: true })
			} else {
				resolve({
					success: false,
					message: `Command exited with code ${code}`,
				})
			}
		})
	})
}

function runCommandInteractive(
	command: string,
	args: string[],
	options: { cwd: string },
): Promise<CommandResult> {
	return new Promise((resolve) => {
		const child = spawn(command, args, {
			cwd: options.cwd,
			stdio: 'inherit',
		})

		child.on('error', (error) => {
			resolve({ success: false, message: error.message, error })
		})

		child.on('close', (code) => {
			if (code === 0 || code === null) {
				resolve({ success: true })
			} else {
				resolve({
					success: false,
					message: `Command exited with code ${code}`,
				})
			}
		})
	})
}
