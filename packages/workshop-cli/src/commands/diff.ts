import chalk from 'chalk'
import { matchSorter } from 'match-sorter'
import { assertCanPrompt } from '../utils/cli-runtime.js'

export type DiffResult = {
	success: boolean
	message?: string
	diff?: string
	error?: Error
}

export type DiffOptions = {
	app1?: string
	app2?: string
	silent?: boolean
}

/**
 * Show diff between the current playground and its solution
 */
export async function showProgressDiff(
	options: { silent?: boolean } = {},
): Promise<DiffResult> {
	const { silent = false } = options

	try {
		const {
			init,
			getApps,
			getFullPathFromAppName,
			findSolutionDir,
			isPlaygroundApp,
		} = await import('@epic-web/workshop-utils/apps.server')
		const { getDiffOutputWithRelativePaths } =
			await import('@epic-web/workshop-utils/diff.server')

		await init()

		const apps = await getApps()
		const playgroundApp = apps.find(isPlaygroundApp)

		if (!playgroundApp) {
			throw new Error(
				'No playground app found. Set one with "epicshop playground set"',
			)
		}

		const solutionDir = await findSolutionDir({
			fullPath: await getFullPathFromAppName(playgroundApp.appName),
		})
		const headApp = apps.find((a) => a.fullPath === solutionDir)

		if (!headApp) {
			throw new Error('No solution app found for the current playground')
		}

		const diffCode = await getDiffOutputWithRelativePaths(
			playgroundApp,
			headApp,
		)

		if (!diffCode) {
			if (!silent) {
				console.log(
					chalk.green('✓ No differences - your work matches the solution!'),
				)
			}
			return { success: true, message: 'No changes', diff: '' }
		}

		if (!silent) {
			console.log(chalk.bold.cyan('\n📋 Diff: Playground vs Solution\n'))
			console.log(chalk.gray('Lines starting with - need to be removed'))
			console.log(chalk.gray('Lines starting with + need to be added\n'))
			console.log(formatDiff(diffCode))
		}

		return { success: true, diff: diffCode }
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		if (!silent) {
			console.error(chalk.red(`❌ Failed to generate diff: ${message}`))
		}
		return {
			success: false,
			message,
			error: error instanceof Error ? error : new Error(message),
		}
	}
}

/**
 * Interactive diff selection between two apps
 */
export async function selectAndShowDiff(
	options: { silent?: boolean } = {},
): Promise<DiffResult> {
	const { silent = false } = options

	try {
		const {
			findSolutionDir,
			getAppDisplayName,
			getApps,
			getFullPathFromAppName,
			init,
			isPlaygroundApp,
		} = await import('@epic-web/workshop-utils/apps.server')
		const { getDiffOutputWithRelativePaths } =
			await import('@epic-web/workshop-utils/diff.server')

		await init()

		assertCanPrompt({
			reason: 'select apps to diff',
			hints: [
				'Provide the apps directly: npx epicshop diff 01.02.problem 01.02.solution',
			],
		})

		const { search } = await import('@inquirer/prompts')

		const apps = await getApps()
		if (apps.length < 2) {
			throw new Error('Need at least two apps to diff')
		}

		const playgroundApp = apps.find(isPlaygroundApp)
		let defaultFirstApp = playgroundApp
		let defaultSecondApp = undefined as (typeof apps)[number] | undefined
		if (playgroundApp) {
			try {
				const solutionDir = await findSolutionDir({
					fullPath: await getFullPathFromAppName(playgroundApp.appName),
				})
				defaultSecondApp = apps.find((app) => app.fullPath === solutionDir)
			} catch {
				// Ignore default selection errors; still allow interactive selection.
			}
		}

		const choices = apps.map((app) => ({
			name: getAppDisplayName(app, apps),
			value: app,
			description: app.fullPath,
		}))

		const orderChoices = (
			allChoices: typeof choices,
			preferredName?: string,
		) => {
			if (!preferredName) return allChoices
			const preferred = allChoices.find(
				(choice) => choice.value.name === preferredName,
			)
			if (!preferred) return allChoices
			return [
				preferred,
				...allChoices.filter((choice) => choice.value.name !== preferredName),
			]
		}

		const selectApp = async (
			message: string,
			options: { excludeName?: string; preferredName?: string } = {},
		) => {
			const { excludeName, preferredName } = options
			const availableChoices = excludeName
				? choices.filter((choice) => choice.value.name !== excludeName)
				: choices
			const orderedChoices = orderChoices(availableChoices, preferredName)

			return search({
				message,
				source: async (input) => {
					if (!input) return orderedChoices
					return matchSorter(availableChoices, input, {
						keys: ['name', 'value.name', 'description'],
					})
				},
			})
		}

		try {
			const app1 = await selectApp('Select the first app to diff:', {
				preferredName: defaultFirstApp?.name,
			})
			const app2 = await selectApp('Select the second app to diff:', {
				excludeName: app1.name,
				preferredName:
					defaultSecondApp?.name === app1.name
						? undefined
						: defaultSecondApp?.name,
			})
			const diffCode = await getDiffOutputWithRelativePaths(app1, app2)
			const app1Label = getAppDisplayName(app1, apps)
			const app2Label = getAppDisplayName(app2, apps)

			if (!diffCode) {
				if (!silent) {
					console.log(chalk.green('✓ No differences between the apps!'))
				}
				return { success: true, message: 'No changes', diff: '' }
			}

			if (!silent) {
				console.log(
					chalk.bold.cyan(`\n📋 Diff: ${app1Label} vs ${app2Label}\n`),
				)
				console.log(
					chalk.gray(
						`Lines starting with - are in ${app1Label} but not ${app2Label}`,
					),
				)
				console.log(
					chalk.gray(
						`Lines starting with + are in ${app2Label} but not ${app1Label}\n`,
					),
				)
				console.log(formatDiff(diffCode))
			}

			return { success: true, diff: diffCode }
		} catch (error) {
			if ((error as Error).message === 'USER_QUIT') {
				return { success: false, message: 'Cancelled' }
			}
			throw error
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		if (!silent) {
			console.error(chalk.red(`❌ Failed to generate diff: ${message}`))
		}
		return {
			success: false,
			message,
			error: error instanceof Error ? error : new Error(message),
		}
	}
}

/**
 * Show diff between two specific apps
 */
export async function showDiffBetweenApps(
	options: DiffOptions = {},
): Promise<DiffResult> {
	const { app1, app2, silent = false } = options

	try {
		const {
			init,
			getApps,
			isExerciseStepApp,
			extractNumbersAndTypeFromAppNameOrPath,
		} = await import('@epic-web/workshop-utils/apps.server')
		const { getDiffOutputWithRelativePaths } =
			await import('@epic-web/workshop-utils/diff.server')

		await init()

		if (!app1) {
			throw new Error('First app identifier is required')
		}
		if (!app2) {
			throw new Error('Second app identifier is required')
		}

		const app1Info = extractNumbersAndTypeFromAppNameOrPath(app1)
		const app2Info = extractNumbersAndTypeFromAppNameOrPath(app2)

		if (!app1Info?.exerciseNumber || !app1Info?.stepNumber || !app1Info?.type) {
			throw new Error(`Invalid app identifier format: ${app1}`)
		}
		if (!app2Info?.exerciseNumber || !app2Info?.stepNumber || !app2Info?.type) {
			throw new Error(`Invalid app identifier format: ${app2}`)
		}

		const apps = await getApps()
		const exerciseStepApps = apps.filter(isExerciseStepApp)

		const app1App = exerciseStepApps.find(
			(a) =>
				a.exerciseNumber === Number(app1Info.exerciseNumber) &&
				a.stepNumber === Number(app1Info.stepNumber) &&
				a.type === app1Info.type,
		)

		const app2App = exerciseStepApps.find(
			(a) =>
				a.exerciseNumber === Number(app2Info.exerciseNumber) &&
				a.stepNumber === Number(app2Info.stepNumber) &&
				a.type === app2Info.type,
		)

		if (!app1App) {
			throw new Error(`No app found for ${app1}`)
		}
		if (!app2App) {
			throw new Error(`No app found for ${app2}`)
		}

		const diffCode = await getDiffOutputWithRelativePaths(app1App, app2App)

		if (!diffCode) {
			if (!silent) {
				console.log(chalk.green('✓ No differences between the apps!'))
			}
			return { success: true, message: 'No changes', diff: '' }
		}

		if (!silent) {
			console.log(chalk.bold.cyan(`\n📋 Diff: ${app1} vs ${app2}\n`))
			console.log(
				chalk.gray(`Lines starting with - are in ${app1} but not ${app2}`),
			)
			console.log(
				chalk.gray(`Lines starting with + are in ${app2} but not ${app1}\n`),
			)
			console.log(formatDiff(diffCode))
		}

		return { success: true, diff: diffCode }
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		if (!silent) {
			console.error(chalk.red(`❌ Failed to generate diff: ${message}`))
		}
		return {
			success: false,
			message,
			error: error instanceof Error ? error : new Error(message),
		}
	}
}

/**
 * Format diff output with colors
 */
function formatDiff(diff: string): string {
	return diff
		.split('\n')
		.map((line) => {
			if (line.startsWith('+++') || line.startsWith('---')) {
				return chalk.bold(line)
			}
			if (line.startsWith('+')) {
				return chalk.green(line)
			}
			if (line.startsWith('-')) {
				return chalk.red(line)
			}
			if (line.startsWith('@@')) {
				return chalk.cyan(line)
			}
			if (line.startsWith('diff --git')) {
				return chalk.bold.blue(line)
			}
			return line
		})
		.join('\n')
}
