import chalk from 'chalk'
import { matchSorter } from 'match-sorter'
import { assertCanPrompt } from '../utils/cli-runtime.js'

export type ProgressResult = {
	success: boolean
	message?: string
	error?: Error
}

export type ProgressShowOptions = {
	silent?: boolean
	json?: boolean
}

export type ProgressUpdateOptions = {
	lessonSlug?: string
	complete?: boolean
	silent?: boolean
}

/**
 * Show user progress for the current workshop
 */
export async function show(
	options: ProgressShowOptions = {},
): Promise<ProgressResult> {
	const { silent = false, json = false } = options

	try {
		const { init } = await import('@epic-web/workshop-utils/apps.server')
		const { getAuthInfo } = await import('@epic-web/workshop-utils/db.server')
		const { getProgress, getUserInfo } =
			await import('@epic-web/workshop-utils/epic-api.server')
		const { getWorkshopConfig } =
			await import('@epic-web/workshop-utils/config.server')

		await init()

		const authInfo = await getAuthInfo()

		if (!authInfo) {
			if (!silent) {
				console.log(
					chalk.yellow(
						"⚠️  You're not logged in. Use 'epicshop auth login' to log in and track progress.",
					),
				)
			}
			return { success: false, message: 'Not logged in' }
		}

		const userInfo = await getUserInfo()
		const progress = await getProgress()
		const config = getWorkshopConfig()

		if (json) {
			console.log(
				JSON.stringify({ userInfo, progress, workshop: config }, null, 2),
			)
			return { success: true }
		}

		if (!silent) {
			console.log(chalk.bold.cyan(`\n📊 Progress for ${config.title}\n`))

			if (userInfo) {
				console.log(
					`  ${chalk.green('User')}: ${userInfo.name || userInfo.email}`,
				)
				console.log()
			}

			// Group progress by type
			const workshopProgress = progress.filter(
				(p) =>
					p.type === 'workshop-instructions' || p.type === 'workshop-finished',
			)
			const exerciseProgress = progress.filter(
				(p) =>
					p.type === 'instructions' ||
					p.type === 'finished' ||
					p.type === 'step',
			)

			// Show workshop-level progress
			if (workshopProgress.length > 0) {
				console.log(chalk.bold('  Workshop Progress:'))
				for (const item of workshopProgress) {
					const icon = item.epicCompletedAt ? chalk.green('✓') : chalk.gray('○')
					const label =
						item.type === 'workshop-instructions'
							? 'Workshop Intro'
							: 'Workshop Finished'
					console.log(`    ${icon} ${label}`)
				}
				console.log()
			}

			// Group exercise progress by exercise number
			const exerciseGroups = new Map<number, Array<(typeof progress)[number]>>()
			for (const item of exerciseProgress) {
				if ('exerciseNumber' in item) {
					const exNum = item.exerciseNumber
					if (!exerciseGroups.has(exNum)) {
						exerciseGroups.set(exNum, [])
					}
					exerciseGroups.get(exNum)!.push(item)
				}
			}

			// Sort by exercise number and display
			const sortedExercises = Array.from(exerciseGroups.entries()).sort(
				([a], [b]) => a - b,
			)

			console.log(chalk.bold('  Exercise Progress:'))
			for (const [exNum, items] of sortedExercises) {
				const intro = items.find((i) => i.type === 'instructions')
				const outro = items.find((i) => i.type === 'finished')
				const steps = items
					.filter((i) => i.type === 'step')
					.sort((a, b) => {
						if (a.type === 'step' && b.type === 'step') {
							return a.stepNumber - b.stepNumber
						}
						return 0
					})

				const allComplete = items.every((i) => i.epicCompletedAt)
				const anyComplete = items.some((i) => i.epicCompletedAt)
				const exIcon = allComplete
					? chalk.green('✓')
					: anyComplete
						? chalk.yellow('◐')
						: chalk.gray('○')

				console.log(
					`    ${exIcon} Exercise ${exNum.toString().padStart(2, '0')}`,
				)

				if (intro) {
					const icon = intro.epicCompletedAt
						? chalk.green('✓')
						: chalk.gray('○')
					console.log(`      ${icon} Intro`)
				}

				for (const step of steps) {
					if (step.type === 'step') {
						const icon = step.epicCompletedAt
							? chalk.green('✓')
							: chalk.gray('○')
						console.log(
							`      ${icon} Step ${step.stepNumber.toString().padStart(2, '0')}`,
						)
					}
				}

				if (outro) {
					const icon = outro.epicCompletedAt
						? chalk.green('✓')
						: chalk.gray('○')
					console.log(`      ${icon} Outro`)
				}
			}

			// Calculate overall progress
			const totalItems = progress.length
			const completedItems = progress.filter((p) => p.epicCompletedAt).length
			const percentage =
				totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0

			console.log()
			console.log(
				chalk.bold(
					`  Overall: ${completedItems}/${totalItems} (${percentage}%)`,
				),
			)
			console.log()
		}

		return { success: true }
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		if (!silent) {
			console.error(chalk.red(`❌ Failed to get progress: ${message}`))
		}
		return {
			success: false,
			message,
			error: error instanceof Error ? error : new Error(message),
		}
	}
}

/**
 * Update progress for a specific lesson
 */
export async function update(
	options: ProgressUpdateOptions = {},
): Promise<ProgressResult> {
	const { lessonSlug, complete = true, silent = false } = options

	try {
		const { init } = await import('@epic-web/workshop-utils/apps.server')
		const { getAuthInfo } = await import('@epic-web/workshop-utils/db.server')
		const { updateProgress, getProgress } =
			await import('@epic-web/workshop-utils/epic-api.server')

		await init()

		const authInfo = await getAuthInfo()

		if (!authInfo) {
			if (!silent) {
				console.log(
					chalk.yellow(
						"⚠️  You're not logged in. Use 'epicshop auth login' to log in first.",
					),
				)
			}
			return { success: false, message: 'Not logged in' }
		}

		let targetSlug = lessonSlug

		// If no slug provided, show interactive picker
		if (!targetSlug) {
			assertCanPrompt({
				reason: 'select a lesson to mark as complete/incomplete',
				hints: [
					'Provide the lesson slug: npx epicshop progress update <lesson-slug>',
					'Example: npx epicshop progress update 01-01-problem',
				],
			})

			const { search } = await import('@inquirer/prompts')
			const progress = await getProgress()

			const choices = progress.map((item) => {
				const icon = item.epicCompletedAt ? chalk.green('✓') : chalk.gray('○')
				let label = item.epicLessonSlug

				if (item.type === 'workshop-instructions') {
					label = 'Workshop Intro'
				} else if (item.type === 'workshop-finished') {
					label = 'Workshop Finished'
				} else if (item.type === 'instructions') {
					label = `Exercise ${item.exerciseNumber.toString().padStart(2, '0')} Intro`
				} else if (item.type === 'finished') {
					label = `Exercise ${item.exerciseNumber.toString().padStart(2, '0')} Outro`
				} else if (item.type === 'step') {
					label = `Exercise ${item.exerciseNumber.toString().padStart(2, '0')} Step ${item.stepNumber.toString().padStart(2, '0')}`
				}

				return {
					name: `${icon} ${label}`,
					value: item.epicLessonSlug,
					description: item.epicLessonUrl,
				}
			})

			try {
				targetSlug = await search({
					message: `Select a lesson to mark as ${complete ? 'complete' : 'incomplete'}:`,
					source: async (input) => {
						if (!input) return choices
						return matchSorter(choices, input, {
							keys: ['name', 'value'],
						})
					},
				})
			} catch (error) {
				if ((error as Error).message === 'USER_QUIT') {
					return { success: false, message: 'Cancelled' }
				}
				throw error
			}
		}

		await updateProgress({ lessonSlug: targetSlug, complete })

		const statusWord = complete ? 'complete' : 'incomplete'
		if (!silent) {
			console.log(chalk.green(`✅ Marked "${targetSlug}" as ${statusWord}`))
		}
		return {
			success: true,
			message: `Marked "${targetSlug}" as ${statusWord}`,
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		if (!silent) {
			console.error(chalk.red(`❌ Failed to update progress: ${message}`))
		}
		return {
			success: false,
			message,
			error: error instanceof Error ? error : new Error(message),
		}
	}
}
