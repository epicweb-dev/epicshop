import '@epic-web/workshop-utils/init-env'

import { spawn } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import chalk from 'chalk'
import { matchSorter } from 'match-sorter'

const GITHUB_ORG = 'epicweb-dev'
const TUTORIAL_REPO = 'epicshop-tutorial'

/**
 * Find the workshop root directory by walking up from the current directory
 * looking for a package.json with an epicshop field.
 * Returns the workshop root path if found, null otherwise.
 */
export async function findWorkshopRoot(): Promise<string | null> {
	let currentDir = process.cwd()
	const root = path.parse(currentDir).root

	while (currentDir !== root) {
		try {
			const packageJsonPath = path.join(currentDir, 'package.json')
			const content = await fs.promises.readFile(packageJsonPath, 'utf-8')
			const packageJson = JSON.parse(content) as { epicshop?: unknown }

			// Check if epicshop config exists
			if (packageJson.epicshop) {
				return currentDir
			}
		} catch {
			// No package.json or can't read it, continue up
		}

		// Move up one directory
		const parentDir = path.dirname(currentDir)
		if (parentDir === currentDir) {
			// We've reached the root
			break
		}
		currentDir = parentDir
	}

	return null
}

/**
 * Check if the current working directory is inside a workshop
 * (has epicshop config in package.json in current dir or any parent)
 */
export async function isInWorkshopDirectory(): Promise<boolean> {
	return (await findWorkshopRoot()) !== null
}

export type WorkshopsResult = {
	success: boolean
	message?: string
	error?: Error
}

export type AddOptions = {
	repoName?: string
	directory?: string
	silent?: boolean
}

type GitHubRepo = {
	name: string
	description: string | null
	html_url: string
	stargazers_count: number
	topics: string[]
}

type GitHubSearchResponse = {
	total_count: number
	incomplete_results: boolean
	items: GitHubRepo[]
}

/**
 * Fetch available workshops from GitHub (epicweb-dev org with 'workshop' topic)
 */
async function fetchAvailableWorkshops(): Promise<GitHubRepo[]> {
	const url = `https://api.github.com/search/repositories?q=topic:workshop+org:${GITHUB_ORG}&sort=stars&order=desc`

	const response = await fetch(url, {
		headers: {
			Accept: 'application/vnd.github.v3+json',
			'User-Agent': 'epicshop-cli',
		},
	})

	if (!response.ok) {
		if (response.status === 403) {
			throw new Error(
				'GitHub API rate limit exceeded. Please try again in a minute.',
			)
		}
		throw new Error(`Failed to fetch workshops from GitHub: ${response.status}`)
	}

	const data = (await response.json()) as GitHubSearchResponse
	return data.items
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
	const { silent = false } = options
	let { repoName } = options

	try {
		// If no repo name provided, fetch available workshops and let user select
		if (!repoName) {
			if (silent) {
				return {
					success: false,
					message: 'Repository name is required in silent mode',
				}
			}

			console.log(chalk.cyan('\n🔍 Fetching available workshops...\n'))

			let workshops: GitHubRepo[]
			try {
				workshops = await fetchAvailableWorkshops()
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error)
				console.error(chalk.red(`❌ ${message}`))
				return {
					success: false,
					message,
					error: error instanceof Error ? error : new Error(message),
				}
			}

			if (workshops.length === 0) {
				const message = 'No workshops found on GitHub'
				console.log(chalk.yellow(message))
				return { success: false, message }
			}

			const { search } = await import('@inquirer/prompts')

			const allChoices = workshops.map((w) => ({
				name: w.name,
				value: w.name,
				description: w.description || undefined,
			}))

			console.log(
				chalk.bold.cyan(`📚 Available Workshops (${workshops.length}):\n`),
			)

			repoName = await search({
				message: 'Select a workshop to add:',
				source: async (input) => {
					if (!input) {
						return allChoices
					}
					return matchSorter(allChoices, input, {
						keys: ['name', 'value', 'description'],
					})
				},
			})
		}

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
			const message = `No workshops found. Use 'epicshop add <repo-name>' to add one.`
			if (!silent) {
				console.log(chalk.yellow(message))
				console.log(chalk.gray(`\nWorkshops directory: ${reposDir}`))
			}
			return { success: true, message }
		}

		if (silent) {
			return {
				success: true,
				message: `Found ${workshops.length} workshop(s)`,
			}
		}

		// Interactive selection
		const { search } = await import('@inquirer/prompts')

		const allChoices = workshops.map((w) => ({
			name: `${w.title} (${w.repoName})`,
			value: w,
			description: w.path,
		}))

		console.log(chalk.bold.cyan('\n📚 Your Workshops:\n'))

		const selectedWorkshop = await search({
			message: 'Select a workshop:',
			source: async (input) => {
				if (!input) {
					return allChoices
				}
				return matchSorter(allChoices, input, {
					keys: [
						'name',
						'value.repoName',
						'value.title',
						'value.subtitle',
						'description',
					],
				})
			},
		})

		// Show actions for selected workshop
		const actionChoices = [
			{
				name: 'Start workshop',
				value: 'start',
				description: 'Run npm start in the workshop directory',
			},
			{
				name: 'Open in editor',
				value: 'open',
				description: 'Open the workshop in your code editor',
			},
			{
				name: 'Remove workshop',
				value: 'remove',
				description: 'Delete the workshop directory',
			},
			{
				name: 'Back to list',
				value: 'back',
				description: 'Go back to workshop selection',
			},
		]

		const action = await search({
			message: `What would you like to do with "${selectedWorkshop.title}"?`,
			source: async (input) => {
				if (!input) {
					return actionChoices
				}
				return matchSorter(actionChoices, input, {
					keys: ['name', 'value', 'description'],
				})
			},
		})

		switch (action) {
			case 'start':
				return await startWorkshop({ workshop: selectedWorkshop.repoName })
			case 'open':
				return await openWorkshop({ workshop: selectedWorkshop.repoName })
			case 'remove':
				return await remove({ workshop: selectedWorkshop.repoName })
			case 'back':
				return await list({ silent })
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
		const {
			getWorkshop,
			getWorkshopByPath,
			listWorkshops,
			getUnpushedChanges,
			deleteWorkshop,
		} = await import('@epic-web/workshop-utils/workshops.server')

		let workshopData

		// If workshop specified, try to find it
		if (workshop) {
			// First check if it's a path (absolute or looks like a directory)
			if (workshop.startsWith('/') || workshop.includes(path.sep)) {
				// Try to find by path
				workshopData = await getWorkshopByPath(workshop)
				if (!workshopData) {
					const message = `Workshop at "${workshop}" is not in your repos directory and cannot be removed via epicshop. Delete it manually if needed.`
					if (!silent) console.log(chalk.yellow(`⚠️  ${message}`))
					return { success: false, message }
				}
			} else {
				// It's a workshop name, look it up
				workshopData = await getWorkshop(workshop)
				if (!workshopData) {
					const message = `Workshop "${workshop}" not found`
					if (!silent) console.log(chalk.yellow(`⚠️  ${message}`))
					return { success: false, message }
				}
			}
		} else {
			// Ensure config is set up first for interactive selection
			if (!(await ensureConfigured())) {
				return { success: false, message: 'Setup cancelled' }
			}

			// No workshop specified, prompt for selection
			const workshops = await listWorkshops()

			if (workshops.length === 0) {
				const message = `No workshops to remove. Use 'epicshop add <repo-name>' to add one first.`
				if (!silent) console.log(chalk.yellow(message))
				return { success: false, message }
			}

			const { search } = await import('@inquirer/prompts')

			const allChoices = workshops.map((w) => ({
				name: `${w.title} (${w.repoName})`,
				value: w,
				description: w.path,
			}))

			workshopData = await search({
				message: 'Select a workshop to remove:',
				source: async (input) => {
					if (!input) {
						return allChoices
					}
					return matchSorter(allChoices, input, {
						keys: ['name', 'value.repoName', 'value.title', 'description'],
					})
				},
			})
		}

		if (!workshopData) {
			const message = 'No workshop selected'
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
				const message = `No workshops found. Use 'epicshop add <repo-name>' to add one.`
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
					return matchSorter(allChoices, input, {
						keys: [
							'name',
							'value.repoName',
							'value.title',
							'value.subtitle',
							'description',
						],
					})
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
		const { listWorkshops, getWorkshop, getWorkshopByPath } = await import(
			'@epic-web/workshop-utils/workshops.server'
		)
		const { launchEditor } = await import(
			'@epic-web/workshop-utils/launch-editor.server'
		)

		let workshopToOpen

		// If workshop specified, try to find it
		if (options.workshop) {
			// First check if it's a path (absolute or looks like a directory)
			if (
				options.workshop.startsWith('/') ||
				options.workshop.includes(path.sep)
			) {
				// Try to find by path first
				workshopToOpen = await getWorkshopByPath(options.workshop)
				if (!workshopToOpen) {
					// Not in managed workshops, but if it's a valid workshop dir, open it directly
					const pkgPath = path.join(options.workshop, 'package.json')
					try {
						const pkgContent = await fs.promises.readFile(pkgPath, 'utf-8')
						const pkg = JSON.parse(pkgContent) as {
							name?: string
							epicshop?: { title?: string }
						}
						if (pkg.epicshop) {
							// It's a valid workshop directory, create a minimal workshop object
							workshopToOpen = {
								name: pkg.name || path.basename(options.workshop),
								title: pkg.epicshop.title || path.basename(options.workshop),
								repoName: path.basename(options.workshop),
								path: options.workshop,
							}
						}
					} catch {
						// Not a valid workshop directory
					}
				}
			} else {
				// It's a workshop name, look it up
				workshopToOpen = await getWorkshop(options.workshop)
			}

			if (!workshopToOpen) {
				const message = `Workshop "${options.workshop}" not found`
				if (!silent) console.log(chalk.yellow(`⚠️  ${message}`))
				return { success: false, message }
			}
		} else {
			// Ensure config is set up first for interactive selection
			if (!(await ensureConfigured())) {
				return { success: false, message: 'Setup cancelled' }
			}
			// No workshop specified, show selection
			const workshops = await listWorkshops()

			if (workshops.length === 0) {
				const message = `No workshops found. Use 'epicshop add <repo-name>' to add one.`
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
					return matchSorter(allChoices, input, {
						keys: [
							'name',
							'value.repoName',
							'value.title',
							'value.subtitle',
							'description',
						],
					})
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
		const {
			getReposDirectory,
			setReposDirectory,
			isReposDirectoryConfigured,
			loadConfig,
			saveConfig,
			getDefaultReposDir,
		} = await import('@epic-web/workshop-utils/workshops.server')

		if (options.reposDir) {
			// Set the repos directory directly via CLI flag
			const resolvedPath = path.resolve(options.reposDir)
			await setReposDirectory(resolvedPath)
			const message = `Repos directory set to: ${resolvedPath}`
			if (!silent) console.log(chalk.green(`✅ ${message}`))
			return { success: true, message }
		}

		if (silent) {
			// In silent mode, just return current config
			const reposDir = await getReposDirectory()
			return { success: true, message: `Repos directory: ${reposDir}` }
		}

		// Interactive config selection
		const { search, confirm } = await import('@inquirer/prompts')

		const reposDir = await getReposDirectory()
		const isConfigured = await isReposDirectoryConfigured()
		const defaultDir = getDefaultReposDir()

		// Build config options
		const configOptions = [
			{
				name: `Repos directory`,
				value: 'repos-dir',
				description: isConfigured ? reposDir : `${reposDir} (default)`,
			},
		]

		console.log(chalk.bold.cyan('\n⚙️  Workshop Configuration\n'))

		const selectedConfig = await search({
			message: 'Select a setting to configure:',
			source: async (input) => {
				if (!input) return configOptions
				return matchSorter(configOptions, input, {
					keys: ['name', 'value', 'description'],
				})
			},
		})

		if (selectedConfig === 'repos-dir') {
			// Show current value and actions
			console.log()
			console.log(chalk.bold('  Current value:'))
			if (isConfigured) {
				console.log(chalk.white(`  ${reposDir}`))
			} else {
				console.log(chalk.gray(`  ${reposDir} (default, not explicitly set)`))
			}
			console.log()

			const actionChoices = [
				{
					name: 'Edit',
					value: 'edit',
					description: 'Change the repos directory',
				},
				...(isConfigured
					? [
							{
								name: 'Remove',
								value: 'remove',
								description: `Reset to default (${defaultDir})`,
							},
						]
					: []),
				{
					name: 'Cancel',
					value: 'cancel',
					description: 'Go back without changes',
				},
			]

			const action = await search({
				message: 'What would you like to do?',
				source: async (input) => {
					if (!input) return actionChoices
					return matchSorter(actionChoices, input, {
						keys: ['name', 'value', 'description'],
					})
				},
			})

			if (action === 'edit') {
				console.log()
				console.log(
					chalk.cyan('🐨 Use the directory browser to select a new location.'),
				)
				console.log(
					chalk.gray('   Type to search, use arrow keys to navigate.\n'),
				)

				const newDir = await browseDirectory(
					isConfigured ? reposDir : path.dirname(defaultDir),
				)
				const resolvedPath = path.resolve(newDir)
				await setReposDirectory(resolvedPath)

				console.log()
				console.log(
					chalk.green(`✅ Repos directory set to: ${chalk.bold(resolvedPath)}`),
				)
				return {
					success: true,
					message: `Repos directory set to: ${resolvedPath}`,
				}
			} else if (action === 'remove') {
				const shouldRemove = await confirm({
					message: `Reset repos directory to default (${defaultDir})?`,
					default: false,
				})

				if (shouldRemove) {
					const currentConfig = await loadConfig()
					delete currentConfig.reposDirectory
					await saveConfig(currentConfig)

					console.log()
					console.log(
						chalk.green(
							`✅ Repos directory reset to default: ${chalk.bold(defaultDir)}`,
						),
					)
					return {
						success: true,
						message: `Repos directory reset to default: ${defaultDir}`,
					}
				} else {
					console.log(chalk.gray('\nNo changes made.'))
					return { success: true, message: 'Cancelled' }
				}
			} else {
				console.log(chalk.gray('\nNo changes made.'))
				return { success: true, message: 'Cancelled' }
			}
		}

		return { success: true, message: 'Config viewed' }
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
		console.log(
			chalk.cyan(
				"   It looks like this is the first time you're using epicshop, so I'm going to help you get set up and get you started with the tutorial.",
			),
		)
		console.log(
			chalk.gray(
				`   Once you're finished going through the tutorial, feel free to run ${chalk.underline(`npx epicshop ${process.argv.slice(2).join(' ')}`)} again.\n`,
			),
		)

		console.log(
			chalk.white('   First, we need to choose where to store your workshops.'),
		)
		console.log(
			chalk.white(
				'   Workshops are cloned from GitHub and stored in a directory of your choice.\n',
			),
		)

		// Prompt for directory configuration
		const { confirm } = await import('@inquirer/prompts')
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
			console.log()
			console.log(
				chalk.cyan(
					'🐨 No problem! Use the directory browser to find your preferred location.',
				),
			)
			console.log(
				chalk.gray('   Type to search, use arrow keys to navigate.\n'),
			)
			reposDir = await browseDirectory(path.dirname(defaultDir))
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

	async function promptAndOpenTutorial(): Promise<WorkshopsResult> {
		console.log()
		console.log(
			chalk.cyan(
				"🐨 Before we start the tutorial, let's open it in your editor so you can follow along.",
			),
		)
		console.log(
			chalk.cyan(
				'   This will run the "open" command for the tutorial repository.\n',
			),
		)
		const openCommand = `npx epicshop open ${TUTORIAL_REPO}`
		console.log(chalk.gray('   Running:'))
		console.log(chalk.white.bold(`   ${openCommand}\n`))

		await waitForGo()

		return await openWorkshop({ workshop: TUTORIAL_REPO })
	}

	async function promptToStartTutorial(workshopTitle: string): Promise<void> {
		console.log()
		console.log(
			chalk.cyan(
				`🐨 Alright, let's get ${chalk.bold(workshopTitle)} started for you.`,
			),
		)
		console.log(
			chalk.cyan(
				'   Once it\'s running, open it using the "o" key or by going to',
			),
		)
		console.log(chalk.cyan.bold('   http://localhost:5639'))
		console.log(chalk.cyan('   in your browser. See you over there!\n'))

		const startCommand = `npx epicshop start ${TUTORIAL_REPO}`
		console.log(chalk.gray('   Running:'))
		console.log(chalk.white.bold(`   ${startCommand}\n`))

		await waitForGo()
	}

	// Check if tutorial already exists
	if (await workshopExists(TUTORIAL_REPO)) {
		// Tutorial already added, open it in the editor before starting
		const openResult = await promptAndOpenTutorial()
		if (!openResult.success) {
			return openResult
		}

		// Now start the tutorial
		const workshop = await getWorkshop(TUTORIAL_REPO)
		const workshopTitle = workshop?.title || TUTORIAL_REPO

		await promptToStartTutorial(workshopTitle)
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
	const addCommand = `npx epicshop add ${TUTORIAL_REPO}`
	console.log(chalk.gray('   Running:'))
	console.log(chalk.white.bold(`   ${addCommand}\n`))

	// Wait for user to press Enter to proceed
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

	const openResult = await promptAndOpenTutorial()
	if (!openResult.success) {
		return openResult
	}

	await promptToStartTutorial(workshopTitle)

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

const SELECT_CURRENT = Symbol('SELECT_CURRENT')
const GO_UP = Symbol('GO_UP')
const ENTER_CUSTOM = Symbol('ENTER_CUSTOM')

type DirectoryChoice =
	| { type: 'directory'; path: string; name: string }
	| {
			type: 'action'
			action: typeof SELECT_CURRENT | typeof GO_UP | typeof ENTER_CUSTOM
	  }

/**
 * Interactive directory browser that lets users navigate and select a directory
 */
async function browseDirectory(startPath?: string): Promise<string> {
	const { search, input } = await import('@inquirer/prompts')

	let currentPath = startPath || os.homedir()

	// Resolve to absolute path
	currentPath = path.resolve(currentPath)

	while (true) {
		// Build choices for current directory
		const choices: Array<{
			name: string
			value: DirectoryChoice
			description?: string
		}> = []

		// Add action choices at the top
		choices.push({
			name: `📁 Select this directory`,
			value: { type: 'action', action: SELECT_CURRENT },
			description: currentPath,
		})

		// Add "go up" option if not at root
		const parentDir = path.dirname(currentPath)
		if (parentDir !== currentPath) {
			choices.push({
				name: `⬆️  Go up to parent`,
				value: { type: 'action', action: GO_UP },
				description: parentDir,
			})
		}

		// Add custom path option
		choices.push({
			name: `✏️  Enter a custom path`,
			value: { type: 'action', action: ENTER_CUSTOM },
			description: 'Type in any path manually',
		})

		// List subdirectories
		try {
			const entries = await fs.promises.readdir(currentPath, {
				withFileTypes: true,
			})
			const directories = entries
				.filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
				.sort((a, b) => a.name.localeCompare(b.name))

			for (const dir of directories) {
				const fullPath = path.join(currentPath, dir.name)
				choices.push({
					name: `📂 ${dir.name}/`,
					value: { type: 'directory', path: fullPath, name: dir.name },
					description: fullPath,
				})
			}
		} catch {
			// Can't read directory, just show action choices
		}

		const selected = await search<DirectoryChoice>({
			message: `Browse directories (current: ${currentPath})`,
			source: async (term) => {
				if (!term) {
					return choices
				}
				return matchSorter(choices, term, {
					keys: ['name', 'value.name', 'description'],
				})
			},
			pageSize: 15,
		})

		if (selected.type === 'action') {
			if (selected.action === SELECT_CURRENT) {
				return currentPath
			} else if (selected.action === GO_UP) {
				currentPath = parentDir
			} else if (selected.action === ENTER_CUSTOM) {
				const customPath = await input({
					message: 'Enter the directory path:',
					default: currentPath,
					validate: (value) => {
						if (!value.trim()) {
							return 'Please enter a directory path'
						}
						return true
					},
				})
				return path.resolve(customPath)
			}
		} else if (selected.type === 'directory') {
			currentPath = selected.path
		}
	}
}

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
