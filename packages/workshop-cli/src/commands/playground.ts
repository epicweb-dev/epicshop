import chalk from 'chalk'
import { matchSorter } from 'match-sorter'
import { assertCanPrompt } from '../utils/cli-runtime.js'

export type PlaygroundResult = {
	success: boolean
	message?: string
	error?: Error
}

export type PlaygroundShowOptions = {
	silent?: boolean
}

export type PlaygroundSetOptions = {
	exerciseNumber?: number
	stepNumber?: number
	type?: 'problem' | 'solution'
	silent?: boolean
}

export type PlaygroundSavedOptions = {
	savedPlaygroundId?: string
	latest?: boolean
	json?: boolean
	silent?: boolean
}

type SavedPlaygroundEntry = {
	id: string
	appName: string
	createdAt: string
	createdAtMs: number
	fullPath: string
	displayName: string
}

/**
 * Score progress items for sorting to find the next incomplete step
 */
function scoreProgress(
	a: Array<{
		type: string
		exerciseNumber?: number
		stepNumber?: number
	}>[number],
): number {
	if (a.type === 'workshop-instructions') return 0
	if (a.type === 'workshop-finished') return 10000
	if (a.type === 'instructions') return a.exerciseNumber! * 100
	if (a.type === 'step') return a.exerciseNumber! * 100 + a.stepNumber!
	if (a.type === 'finished') return a.exerciseNumber! * 100 + 100
	if (a.type === 'unknown') return 100000
	return -1
}

/**
 * Find the default playground app based on progress or next step
 */
async function findDefaultPlaygroundApp(params: {
	exerciseStepApps: Array<{
		name: string
		exerciseNumber: number
		stepNumber: number
		type: 'problem' | 'solution'
		fullPath: string
	}>
	progress: Array<{
		type: string
		exerciseNumber?: number
		stepNumber?: number
		epicCompletedAt?: string | null
	}>
	authInfo: unknown
	getPlaygroundAppName: () => Promise<string | null>
	isProblemApp: (app: { type: string }) => boolean
}): Promise<
	| {
			name: string
			exerciseNumber: number
			stepNumber: number
			type: 'problem' | 'solution'
			fullPath: string
	  }
	| undefined
> {
	const {
		exerciseStepApps,
		progress,
		authInfo,
		getPlaygroundAppName,
		isProblemApp,
	} = params

	// If authenticated, try to find the next incomplete step based on progress
	if (authInfo) {
		const sortedProgress = [...progress].sort((a, b) => {
			return scoreProgress(a) - scoreProgress(b)
		})
		const nextProgress = sortedProgress.find((p) => !p.epicCompletedAt)

		if (nextProgress && nextProgress.type === 'step') {
			const app = exerciseStepApps.find(
				(a) =>
					a.exerciseNumber === nextProgress.exerciseNumber &&
					a.stepNumber === nextProgress.stepNumber &&
					a.type === 'problem',
			)
			if (app) return app
		}
	}

	// Otherwise, find the next step from current
	const playgroundAppName = await getPlaygroundAppName()
	const currentIndex = exerciseStepApps.findIndex(
		(a) => a.name === playgroundAppName,
	)

	return exerciseStepApps.slice(currentIndex + 1).find(isProblemApp)
}

async function getSavedPlaygroundEntries(): Promise<
	Array<SavedPlaygroundEntry>
> {
	const { init, getApps, getAppDisplayName, getSavedPlaygrounds } =
		await import('@epic-web/workshop-utils/apps.server')
	const { getPreferences } = await import('@epic-web/workshop-utils/db.server')

	await init()
	const persistEnabled = (await getPreferences())?.playground?.persist ?? false
	if (!persistEnabled) {
		throw new Error(
			'Playground persistence is disabled. Enable it in Preferences to use saved playgrounds.',
		)
	}

	const [savedPlaygrounds, apps] = await Promise.all([
		getSavedPlaygrounds(),
		getApps(),
	])

	return savedPlaygrounds.map((entry) => {
		const matchingApp = apps.find((app) => app.name === entry.appName)
		const displayName = matchingApp
			? getAppDisplayName(matchingApp, apps)
			: entry.appName
		return { ...entry, displayName }
	})
}

function getSavedPlaygroundTimestampLabel(entry: SavedPlaygroundEntry) {
	const createdAt = new Date(entry.createdAt)
	if (Number.isNaN(createdAt.getTime())) return entry.createdAt
	return new Intl.DateTimeFormat(undefined, {
		dateStyle: 'medium',
		timeStyle: 'short',
	}).format(createdAt)
}

/**
 * Show current playground status
 */
export async function show(
	options: PlaygroundShowOptions = {},
): Promise<PlaygroundResult> {
	const { silent = false } = options

	try {
		const { init, getPlaygroundApp, getApps, isExerciseStepApp } =
			await import('@epic-web/workshop-utils/apps.server')

		await init()

		const playgroundApp = await getPlaygroundApp()

		if (!playgroundApp) {
			if (!silent) {
				console.log(chalk.yellow('⚠️  No playground is currently set'))
			}
			return { success: true, message: 'No playground set' }
		}

		if (!silent) {
			console.log(chalk.bold.cyan('\n📂 Current Playground\n'))

			const apps = await getApps()
			const exerciseStepApps = apps.filter(isExerciseStepApp)
			const currentApp = exerciseStepApps.find(
				(a) => a.name === playgroundApp.appName,
			)

			if (currentApp) {
				const ex = currentApp.exerciseNumber.toString().padStart(2, '0')
				const st = currentApp.stepNumber.toString().padStart(2, '0')
				console.log(
					`  ${chalk.green('Exercise')}: ${ex} - ${currentApp.title || 'Untitled'}`,
				)
				console.log(`  ${chalk.green('Step')}: ${st}`)
				console.log(`  ${chalk.green('Type')}: ${currentApp.type}`)
				console.log(`  ${chalk.green('Path')}: ${playgroundApp.fullPath}`)
			} else {
				console.log(`  ${chalk.green('App')}: ${playgroundApp.appName}`)
				console.log(`  ${chalk.green('Path')}: ${playgroundApp.fullPath}`)
			}
			console.log()
		}

		return { success: true }
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		if (!silent) {
			console.error(chalk.red(`❌ Failed to get playground status: ${message}`))
		}
		return {
			success: false,
			message,
			error: error instanceof Error ? error : new Error(message),
		}
	}
}

/**
 * Set the playground to a specific exercise step
 */
export async function set(
	options: PlaygroundSetOptions = {},
): Promise<PlaygroundResult> {
	const { exerciseNumber, stepNumber, type, silent = false } = options

	try {
		const {
			init,
			getApps,
			getPlaygroundAppName,
			isExerciseStepApp,
			isProblemApp,
			setPlayground,
		} = await import('@epic-web/workshop-utils/apps.server')
		const { getAuthInfo } = await import('@epic-web/workshop-utils/db.server')
		const { getProgress } =
			await import('@epic-web/workshop-utils/epic-api.server')

		await init()

		const authInfo = await getAuthInfo()

		// If no arguments provided, try to set based on progress or next step
		if (!exerciseNumber && !stepNumber && !type) {
			const apps = await getApps()
			const exerciseStepApps = apps.filter(isExerciseStepApp)
			const progress = await getProgress()

			const desiredApp = await findDefaultPlaygroundApp({
				exerciseStepApps,
				progress,
				authInfo,
				getPlaygroundAppName,
				isProblemApp,
			})

			if (!desiredApp) {
				const message =
					'No next problem app found. You may be at the end of the workshop!'
				if (!silent) {
					console.log(chalk.yellow(`⚠️  ${message}`))
				}
				return { success: false, message }
			}

			await setPlayground(desiredApp.fullPath)
			if (!silent) {
				console.log(chalk.green(`✅ Playground set to ${desiredApp.name}`))
			}
			return { success: true, message: `Playground set to ${desiredApp.name}` }
		}

		// Get current app to use as defaults
		const apps = await getApps()
		const exerciseStepApps = apps.filter(isExerciseStepApp)
		const playgroundAppName = await getPlaygroundAppName()
		const currentIndex = exerciseStepApps.findIndex(
			(a) => a.name === playgroundAppName,
		)
		const currentApp = exerciseStepApps[currentIndex]

		// Build the target from provided args and defaults
		const targetExercise = exerciseNumber ?? currentApp?.exerciseNumber
		const targetStep = stepNumber ?? currentApp?.stepNumber
		const targetType = type ?? currentApp?.type ?? 'problem'

		if (targetExercise === undefined) {
			throw new Error('Exercise number is required when no playground is set')
		}
		if (targetStep === undefined) {
			throw new Error('Step number is required when no playground is set')
		}

		const desiredApp = exerciseStepApps.find(
			(a) =>
				a.exerciseNumber === targetExercise &&
				a.stepNumber === targetStep &&
				a.type === targetType,
		)

		if (!desiredApp) {
			throw new Error(
				`No app found for ${targetExercise}.${targetStep}.${targetType}`,
			)
		}

		await setPlayground(desiredApp.fullPath)
		if (!silent) {
			console.log(chalk.green(`✅ Playground set to ${desiredApp.name}`))
		}
		return { success: true, message: `Playground set to ${desiredApp.name}` }
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		if (!silent) {
			console.error(chalk.red(`❌ Failed to set playground: ${message}`))
		}
		return {
			success: false,
			message,
			error: error instanceof Error ? error : new Error(message),
		}
	}
}

/**
 * Interactive playground selection
 */
export async function selectAndSet(
	options: { silent?: boolean } = {},
): Promise<PlaygroundResult> {
	const { silent = false } = options

	try {
		const {
			init,
			getApps,
			getPlaygroundAppName,
			isExerciseStepApp,
			isProblemApp,
			setPlayground,
		} = await import('@epic-web/workshop-utils/apps.server')
		const { getAuthInfo } = await import('@epic-web/workshop-utils/db.server')
		const { getProgress } =
			await import('@epic-web/workshop-utils/epic-api.server')

		await init()

		assertCanPrompt({
			reason: 'select an exercise step',
			hints: [
				'Provide the target directly: npx epicshop playground set <exercise>.<step>.<type>',
				'Example: npx epicshop playground set 1.1.problem',
			],
		})

		const { search } = await import('@inquirer/prompts')

		const apps = await getApps()
		const exerciseStepApps = apps.filter(isExerciseStepApp)
		const progress = await getProgress()
		const authInfo = await getAuthInfo()

		const defaultApp = await findDefaultPlaygroundApp({
			exerciseStepApps,
			progress,
			authInfo,
			getPlaygroundAppName,
			isProblemApp,
		})

		const choices = exerciseStepApps.map((app) => {
			const ex = app.exerciseNumber.toString().padStart(2, '0')
			const st = app.stepNumber.toString().padStart(2, '0')
			const progressItem = progress.find(
				(p) =>
					p.type === 'step' &&
					p.exerciseNumber === app.exerciseNumber &&
					p.stepNumber === app.stepNumber,
			)
			const isComplete = progressItem?.epicCompletedAt
			const statusIcon = isComplete ? chalk.green('✓') : chalk.gray('○')

			return {
				name: `${statusIcon} ${ex}.${st} ${app.title || 'Untitled'} (${app.type})`,
				value: app,
				description: app.fullPath,
			}
		})
		const orderedChoices = defaultApp
			? (() => {
					const preferred = choices.find(
						(choice) => choice.value.name === defaultApp?.name,
					)
					if (!preferred) return choices
					return [
						preferred,
						...choices.filter(
							(choice) => choice.value.name !== defaultApp?.name,
						),
					]
				})()
			: choices

		try {
			const selectedApp = await search({
				message: 'Select an exercise step to set as playground:',
				source: async (input) => {
					if (!input) return orderedChoices
					return matchSorter(choices, input, {
						keys: ['name', 'value.name'],
					})
				},
			})

			await setPlayground(selectedApp.fullPath)
			if (!silent) {
				console.log(chalk.green(`✅ Playground set to ${selectedApp.name}`))
			}
			return {
				success: true,
				message: `Playground set to ${selectedApp.name}`,
			}
		} catch (error) {
			if ((error as Error).message === 'USER_QUIT') {
				return { success: false, message: 'Cancelled' }
			}
			throw error
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		if (!silent) {
			console.error(chalk.red(`❌ Failed to set playground: ${message}`))
		}
		return {
			success: false,
			message,
			error: error instanceof Error ? error : new Error(message),
		}
	}
}

/**
 * List saved playgrounds
 */
export async function listSavedPlaygrounds(
	options: PlaygroundSavedOptions = {},
): Promise<
	PlaygroundResult & { savedPlaygrounds?: Array<SavedPlaygroundEntry> }
> {
	const { silent = false, json = false } = options

	try {
		const savedPlaygrounds = await getSavedPlaygroundEntries()
		if (!savedPlaygrounds.length) {
			if (!silent) {
				console.log(chalk.yellow('⚠️  No saved playgrounds found'))
			}
			return {
				success: true,
				message: 'No saved playgrounds found',
				savedPlaygrounds: [],
			}
		}

		if (!silent) {
			if (json) {
				console.log(JSON.stringify(savedPlaygrounds, null, 2))
			} else {
				console.log(chalk.bold.cyan('\n📦 Saved Playgrounds\n'))
				for (const entry of savedPlaygrounds) {
					const timestamp = getSavedPlaygroundTimestampLabel(entry)
					console.log(`  ${chalk.green(entry.displayName)} (${entry.appName})`)
					console.log(`    ${chalk.gray(timestamp)}`)
					console.log(`    ${chalk.gray(entry.id)}`)
				}
				console.log()
			}
		}

		return { success: true, savedPlaygrounds }
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		if (!silent) {
			console.error(
				chalk.red(`❌ Failed to list saved playgrounds: ${message}`),
			)
		}
		return {
			success: false,
			message,
			error: error instanceof Error ? error : new Error(message),
		}
	}
}

/**
 * Set the playground to a saved playground by id
 */
export async function setSavedPlayground(
	options: PlaygroundSavedOptions = {},
): Promise<PlaygroundResult> {
	const { savedPlaygroundId, latest = false, silent = false } = options

	try {
		const { setPlayground } =
			await import('@epic-web/workshop-utils/apps.server')
		const savedPlaygrounds = await getSavedPlaygroundEntries()
		if (!savedPlaygrounds.length) {
			const message = 'No saved playgrounds found.'
			if (!silent) {
				console.log(chalk.yellow(`⚠️  ${message}`))
			}
			return { success: false, message }
		}

		const selected =
			latest || !savedPlaygroundId
				? savedPlaygrounds[0]
				: savedPlaygrounds.find((entry) => entry.id === savedPlaygroundId)

		if (!selected) {
			throw new Error(`Saved playground not found: ${savedPlaygroundId}`)
		}

		await setPlayground(selected.fullPath)
		if (!silent) {
			console.log(
				chalk.green(
					`✅ Playground set to saved copy: ${selected.displayName} (${selected.appName})`,
				),
			)
		}

		return {
			success: true,
			message: `Playground set to saved copy: ${selected.displayName}`,
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		if (!silent) {
			console.error(chalk.red(`❌ Failed to set saved playground: ${message}`))
		}
		return {
			success: false,
			message,
			error: error instanceof Error ? error : new Error(message),
		}
	}
}

/**
 * Interactive saved playground selection
 */
export async function selectAndSetSavedPlayground(
	options: PlaygroundSavedOptions = {},
): Promise<PlaygroundResult> {
	const { silent = false } = options

	try {
		const { setPlayground } =
			await import('@epic-web/workshop-utils/apps.server')
		const savedPlaygrounds = await getSavedPlaygroundEntries()
		if (!savedPlaygrounds.length) {
			const message = 'No saved playgrounds found.'
			if (!silent) {
				console.log(chalk.yellow(`⚠️  ${message}`))
			}
			return { success: false, message }
		}

		assertCanPrompt({
			reason: 'select a saved playground',
			hints: [
				'List saved playgrounds: npx epicshop playground saved list',
				'Set directly: npx epicshop playground saved <saved-playground-id>',
			],
		})

		const { search } = await import('@inquirer/prompts')
		const choices = savedPlaygrounds.map((entry) => {
			const timestamp = getSavedPlaygroundTimestampLabel(entry)
			return {
				name: `${entry.displayName} (${entry.appName}) — ${timestamp}`,
				value: entry,
				description: entry.id,
			}
		})

		try {
			const selectedEntry = await search({
				message: 'Select a saved playground to restore:',
				source: async (input) => {
					if (!input) return choices
					return matchSorter(choices, input, {
						keys: ['name', 'description', 'value.appName', 'value.id'],
					})
				},
			})

			await setPlayground(selectedEntry.fullPath)
			if (!silent) {
				console.log(
					chalk.green(
						`✅ Playground set to saved copy: ${selectedEntry.displayName}`,
					),
				)
			}

			return {
				success: true,
				message: `Playground set to saved copy: ${selectedEntry.displayName}`,
			}
		} catch (error) {
			if ((error as Error).message === 'USER_QUIT') {
				return { success: false, message: 'Cancelled' }
			}
			throw error
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		if (!silent) {
			console.error(chalk.red(`❌ Failed to set saved playground: ${message}`))
		}
		return {
			success: false,
			message,
			error: error instanceof Error ? error : new Error(message),
		}
	}
}

/**
 * Parse an app identifier string like "1.2.problem" or "01.02.solution"
 */
export function parseAppIdentifier(identifier: string): {
	exerciseNumber?: number
	stepNumber?: number
	type?: 'problem' | 'solution'
} {
	const parts = identifier.split('.')

	// Handle formats like "1", "1.2", "1.2.problem"
	const result: {
		exerciseNumber?: number
		stepNumber?: number
		type?: 'problem' | 'solution'
	} = {}

	if (parts.length >= 1 && parts[0]) {
		const num = parseInt(parts[0], 10)
		if (!isNaN(num)) {
			result.exerciseNumber = num
		}
	}

	if (parts.length >= 2 && parts[1]) {
		const num = parseInt(parts[1], 10)
		if (!isNaN(num)) {
			result.stepNumber = num
		} else if (parts[1] === 'problem' || parts[1] === 'solution') {
			result.type = parts[1]
		}
	}

	if (parts.length >= 3 && parts[2]) {
		if (parts[2] === 'problem' || parts[2] === 'solution') {
			result.type = parts[2]
		}
	}

	return result
}
