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
		// Ensure config is set up first
		if (!(await ensureConfigured())) {
			return { success: false, message: 'Setup cancelled' }
		}

		const { getReposDirectory, workshopExists } = await import(
			'@epic-web/workshop-utils/workshops.server'
		)

		// Check if workshop already exists
		if (await workshopExists(repoName)) {
			const message = `Workshop "${repoName}" already exists`
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

		const message = `Workshop "${repoName}" added successfully at ${workshopPath}`
		if (!silent) {
			console.log(chalk.green(`✅ ${message}`))
		}

		return { success: true, message }
	} catch (error) {
		if ((error as Error).message === 'USER_QUIT') {
			return { success: false, message: 'User quit' }
		}
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
 * List all workshops found in the repos directory
 */
export async function list({
	silent = false,
}: { silent?: boolean } = {}): Promise<WorkshopsResult> {
	try {
		// Ensure config is set up first
		if (!(await ensureConfigured())) {
			return { success: false, message: 'Setup cancelled' }
		}

		const { listWorkshops, getReposDirectory } = await import(
			'@epic-web/workshop-utils/workshops.server'
		)

		const workshops = await listWorkshops()
		const reposDir = await getReposDirectory()

		if (workshops.length === 0) {
			const message = `No workshops found. Use 'epicshop workshops add <repo-name>' to add one.`
			if (!silent) {
				console.log(chalk.yellow(message))
				console.log(chalk.gray(`\nWorkshops directory: ${reposDir}`))
			}
			return { success: true, message }
		}

		if (!silent) {
			console.log(chalk.bold.cyan('\n📚 Your Workshops:\n'))
			for (const workshop of workshops) {
				console.log(`  ${chalk.green('✓')} ${chalk.bold(workshop.title)}`)
				if (workshop.subtitle) {
					console.log(chalk.gray(`      ${workshop.subtitle}`))
				}
				console.log(chalk.gray(`      Repo: ${workshop.repoName}`))
				console.log(chalk.gray(`      Path: ${workshop.path}`))
				console.log()
			}
			console.log(chalk.gray(`Workshops directory: ${reposDir}\n`))
		}

		return {
			success: true,
			message: `Found ${workshops.length} workshop(s)`,
		}
	} catch (error) {
		if ((error as Error).message === 'USER_QUIT') {
			return { success: false, message: 'User quit' }
		}
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
 * Remove a workshop (deletes the directory)
 */
export async function remove({
	workshop,
	silent = false,
}: {
	workshop?: string
	silent?: boolean
}): Promise<WorkshopsResult> {
	try {
		// Ensure config is set up first
		if (!(await ensureConfigured())) {
			return { success: false, message: 'Setup cancelled' }
		}

		const { getWorkshop, listWorkshops, getUnpushedChanges, deleteWorkshop } =
			await import('@epic-web/workshop-utils/workshops.server')

		let workshopToRemove = workshop

		// If no workshop specified, prompt for selection
		if (!workshopToRemove) {
			const workshops = await listWorkshops()

			if (workshops.length === 0) {
				const message = `No workshops to remove. Use 'epicshop workshops add <repo-name>' to add one first.`
				if (!silent) console.log(chalk.yellow(message))
				return { success: false, message }
			}

			const { search } = await import('@inquirer/prompts')

			const allChoices = workshops.map((w) => ({
				name: `${w.title} (${w.repoName})`,
				value: w.repoName,
				description: w.path,
			}))

			workshopToRemove = await search({
				message: 'Select a workshop to remove:',
				source: async (input) => {
					if (!input) {
						return allChoices
					}
					const searchLower = input.toLowerCase()
					return allChoices.filter(
						(choice) =>
							choice.name.toLowerCase().includes(searchLower) ||
							choice.value.toLowerCase().includes(searchLower) ||
							choice.description?.toLowerCase().includes(searchLower),
					)
				},
			})
		}

		const workshopData = await getWorkshop(workshopToRemove)
		if (!workshopData) {
			const message = `Workshop "${workshopToRemove}" not found`
			if (!silent) console.log(chalk.yellow(`⚠️  ${message}`))
			return { success: false, message }
		}

		// Check for unpushed changes
		const unpushed = await getUnpushedChanges(workshopData.path)

		if (unpushed.hasUnpushed) {
			console.log()
			console.log(
				chalk.yellow.bold(
					`⚠️  Warning: "${workshopData.title}" has unpushed changes:\n`,
				),
			)
			for (const line of unpushed.summary) {
				console.log(chalk.yellow(`   • ${line}`))
			}
			console.log()

			const { confirm } = await import('@inquirer/prompts')
			const shouldDelete = await confirm({
				message: `Delete "${workshopData.title}" anyway? This cannot be undone.`,
				default: false,
			})

			if (!shouldDelete) {
				const message = 'Removal cancelled'
				if (!silent) console.log(chalk.gray(message))
				return { success: false, message }
			}
		} else {
			// No unpushed changes, but still confirm deletion
			const { confirm } = await import('@inquirer/prompts')
			const shouldDelete = await confirm({
				message: `Delete "${workshopData.title}" at ${workshopData.path}?`,
				default: false,
			})

			if (!shouldDelete) {
				const message = 'Removal cancelled'
				if (!silent) console.log(chalk.gray(message))
				return { success: false, message }
			}
		}

		// Delete the workshop directory
		await deleteWorkshop(workshopData.path)

		const message = `Workshop "${workshopData.title}" deleted successfully`
		if (!silent) console.log(chalk.green(`✅ ${message}`))
		return { success: true, message }
	} catch (error) {
		if ((error as Error).message === 'USER_QUIT') {
			return { success: false, message: 'User quit' }
		}
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
		// Ensure config is set up first
		if (!(await ensureConfigured())) {
			return { success: false, message: 'Setup cancelled' }
		}

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
				const message = `No workshops found. Use 'epicshop workshops add <repo-name>' to add one.`
				if (!silent) console.log(chalk.yellow(message))
				return { success: false, message }
			}

			// Interactive selection
			const { search } = await import('@inquirer/prompts')

			const allChoices = workshops.map((w) => ({
				name: `${w.title} (${w.repoName})`,
				value: w,
				description: w.path,
			}))

			workshopToStart = await search({
				message: 'Select a workshop to start:',
				source: async (input) => {
					if (!input) {
						return allChoices
					}
					const searchLower = input.toLowerCase()
					return allChoices.filter(
						(choice) =>
							choice.name.toLowerCase().includes(searchLower) ||
							choice.value.repoName.toLowerCase().includes(searchLower) ||
							choice.value.title.toLowerCase().includes(searchLower) ||
							choice.description?.toLowerCase().includes(searchLower),
					)
				},
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
				chalk.cyan(`🚀 Starting ${chalk.bold(workshopToStart.title)}...`),
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
		if ((error as Error).message === 'USER_QUIT') {
			return { success: false, message: 'User quit' }
		}
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
 * Open a workshop in the user's editor
 */
export async function openWorkshop(
	options: StartOptions = {},
): Promise<WorkshopsResult> {
	const { silent = false } = options

	try {
		// Ensure config is set up first
		if (!(await ensureConfigured())) {
			return { success: false, message: 'Setup cancelled' }
		}

		const { listWorkshops, getWorkshop } = await import(
			'@epic-web/workshop-utils/workshops.server'
		)
		const { launchEditor } = await import(
			'@epic-web/workshop-utils/launch-editor.server'
		)

		let workshopToOpen

		// If workshop specified, look it up and fail if not found
		if (options.workshop) {
			workshopToOpen = await getWorkshop(options.workshop)
			if (!workshopToOpen) {
				const message = `Workshop "${options.workshop}" not found`
				if (!silent) console.log(chalk.yellow(`⚠️  ${message}`))
				return { success: false, message }
			}
		} else {
			// No workshop specified, show selection
			const workshops = await listWorkshops()

			if (workshops.length === 0) {
				const message = `No workshops found. Use 'epicshop workshops add <repo-name>' to add one.`
				if (!silent) console.log(chalk.yellow(message))
				return { success: false, message }
			}

			// Interactive selection
			const { search } = await import('@inquirer/prompts')

			const allChoices = workshops.map((w) => ({
				name: `${w.title} (${w.repoName})`,
				value: w,
				description: w.path,
			}))

			workshopToOpen = await search({
				message: 'Select a workshop to open:',
				source: async (input) => {
					if (!input) {
						return allChoices
					}
					const searchLower = input.toLowerCase()
					return allChoices.filter(
						(choice) =>
							choice.name.toLowerCase().includes(searchLower) ||
							choice.value.repoName.toLowerCase().includes(searchLower) ||
							choice.value.title.toLowerCase().includes(searchLower) ||
							choice.description?.toLowerCase().includes(searchLower),
					)
				},
			})
		}

		if (!workshopToOpen) {
			const message = 'No workshop selected'
			if (!silent) console.log(chalk.yellow(`⚠️  ${message}`))
			return { success: false, message }
		}

		// Check if the workshop directory exists
		if (!(await directoryExists(workshopToOpen.path))) {
			const message = `Workshop directory not found: ${workshopToOpen.path}`
			if (!silent) console.log(chalk.red(`❌ ${message}`))
			return { success: false, message }
		}

		if (!silent) {
			console.log(
				chalk.cyan(
					`📂 Opening ${chalk.bold(workshopToOpen.title)} in your editor...`,
				),
			)
			console.log(chalk.gray(`   Path: ${workshopToOpen.path}\n`))
		}

		// Launch the editor with the workshop directory
		const result = await launchEditor(workshopToOpen.path)

		if (result.status === 'error') {
			return {
				success: false,
				message: result.message,
			}
		}

		return { success: true, message: 'Workshop opened in editor' }
	} catch (error) {
		if ((error as Error).message === 'USER_QUIT') {
			return { success: false, message: 'User quit' }
		}
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
 * Check if the workshops directory is configured, and run onboarding if not
 * Call this at the start of any command that requires the config to be set
 */
export async function ensureConfigured(): Promise<boolean> {
	const { isReposDirectoryConfigured } = await import(
		'@epic-web/workshop-utils/workshops.server'
	)

	if (await isReposDirectoryConfigured()) {
		return true
	}

	// Not configured, run onboarding
	const result = await onboarding()
	return result.success
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

		// Welcome message from Kody
		console.log()
		console.log(
			chalk.cyan(
				"🐨 Hey there! Welcome to the epicshop CLI. I'm Kody the Koala, and I'm here to help you learn.",
			),
		)
		console.log(chalk.cyan("   Let's get you set up.\n"))

		console.log(
			chalk.white('   First, we need to choose where to store your workshops.'),
		)
		console.log(
			chalk.white(
				'   Workshops are cloned from GitHub and stored in a directory of your choice.\n',
			),
		)

		// Prompt for directory configuration
		const { input, confirm } = await import('@inquirer/prompts')
		const defaultDir = getDefaultReposDir()

		console.log(chalk.gray(`   Recommended: ${chalk.white(defaultDir)}\n`))

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
		if ((error as Error).message === 'USER_QUIT') {
			return { success: false, message: 'User quit' }
		}
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
	const { workshopExists, getReposDirectory, getWorkshop } = await import(
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

	console.log()
	console.log(
		chalk.cyan("🐨 Now let's get you started with the epicshop tutorial."),
	)
	console.log(
		chalk.cyan(
			"   I'll clone the tutorial repository and set it up for you.\n",
		),
	)

	// Show the command we're effectively running
	const addCommand = `npx epicshop workshops add ${TUTORIAL_REPO}`
	console.log(chalk.gray('   Running:'))
	console.log(chalk.white.bold(`   ${addCommand}\n`))

	// Wait for user to press 'g' to proceed
	await waitForGo()

	console.log(chalk.cyan(`\n📦 Cloning ${TUTORIAL_REPO}...`))

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

	// Get the workshop info (now discoverable since it has package.json with epicshop)
	const workshop = await getWorkshop(TUTORIAL_REPO)
	const workshopTitle = workshop?.title || TUTORIAL_REPO

	console.log()
	console.log(
		chalk.green(
			`✅ ${chalk.bold(workshopTitle)} has been set up successfully!\n`,
		),
	)

	// Kody's message before starting
	console.log(chalk.cyan("🐨 Alright, let's get the tutorial started for you."))
	console.log(
		chalk.cyan(
			'   Once it\'s running, open it using the "o" key or by going to',
		),
	)
	console.log(chalk.cyan.bold('   http://localhost:5639'))
	console.log(chalk.cyan('   in your browser. See you over there!\n'))

	// Show the command to start
	const startCommand = `npx epicshop workshops start ${TUTORIAL_REPO}`
	console.log(chalk.gray('   Running:'))
	console.log(chalk.white.bold(`   ${startCommand}\n`))

	// Wait for user to press 'g' to proceed
	await waitForGo()

	console.log(chalk.cyan(`\n🚀 Starting ${chalk.bold(workshopTitle)}...\n`))

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
 * Check if the workshops directory is configured
 */
export async function isConfigured(): Promise<boolean> {
	const { isReposDirectoryConfigured } = await import(
		'@epic-web/workshop-utils/workshops.server'
	)
	return isReposDirectoryConfigured()
}

/**
 * Wait for user to press Enter to proceed or 'q' to quit
 */
async function waitForGo(): Promise<void> {
	return new Promise((resolve, reject) => {
		console.log(chalk.cyan("🐨 Press Enter when you're ready to go."))
		console.log(chalk.gray('   (press "q" to quit)'))
		console.log()

		const cleanup = () => {
			if (process.stdin.isTTY) {
				process.stdin.setRawMode(false)
				process.stdin.removeListener('data', onData)
				process.stdin.pause()
			}
		}

		const onData = (key: Buffer) => {
			const char = key.toString()
			// Handle Enter key to go (Enter sends '\r' in raw mode)
			if (char === '\r' || char === '\n') {
				cleanup()
				resolve()
			}
			// Handle 'q' or Ctrl+C to quit
			if (char.toLowerCase() === 'q' || char === '\u0003') {
				cleanup()
				console.log(chalk.gray('\n👋 Goodbye!'))
				reject(new Error('USER_QUIT'))
			}
		}

		if (process.stdin.isTTY) {
			process.stdin.setRawMode(true)
			process.stdin.resume()
			process.stdin.on('data', onData)
		} else {
			// Non-TTY mode, just resolve immediately
			resolve()
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
