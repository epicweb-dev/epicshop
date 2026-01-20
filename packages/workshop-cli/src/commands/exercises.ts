import chalk from 'chalk'

export type ExercisesResult = {
	success: boolean
	message?: string
	error?: Error
}

export type ExercisesListOptions = {
	silent?: boolean
	json?: boolean
}

export type ExerciseContextOptions = {
	exerciseNumber?: number
	stepNumber?: number
	silent?: boolean
	json?: boolean
}

/**
 * List all exercises with progress
 */
export async function list(
	options: ExercisesListOptions = {},
): Promise<ExercisesResult> {
	const { silent = false, json = false } = options

	try {
		const { init, getExercises, getPlaygroundApp, isExerciseStepApp, getApps } =
			await import('@epic-web/workshop-utils/apps.server')
		const { getWorkshopConfig } =
			await import('@epic-web/workshop-utils/config.server')
		const { getProgress } =
			await import('@epic-web/workshop-utils/epic-api.server')

		await init()

		const config = getWorkshopConfig()
		const exercises = await getExercises()
		const progress = await getProgress()
		const playgroundApp = await getPlaygroundApp()
		const apps = await getApps()

		// Find current exercise/step from playground
		let currentExercise: number | null = null
		let currentStep: number | null = null
		if (playgroundApp) {
			const currentApp = apps
				.filter(isExerciseStepApp)
				.find((a) => a.name === playgroundApp.appName)
			if (currentApp) {
				currentExercise = currentApp.exerciseNumber
				currentStep = currentApp.stepNumber
			}
		}

		if (json) {
			const output = {
				workshop: {
					title: config.title,
					subtitle: config.subtitle,
				},
				currentPlayground: currentExercise
					? { exerciseNumber: currentExercise, stepNumber: currentStep }
					: null,
				exercises: exercises.map((exercise) => ({
					exerciseNumber: exercise.exerciseNumber,
					title: exercise.title,
					steps: exercise.steps.map((step) => {
						const stepProgress = progress.find(
							(p) =>
								p.type === 'step' &&
								p.exerciseNumber === exercise.exerciseNumber &&
								p.stepNumber === step.stepNumber,
						)
						return {
							stepNumber: step.stepNumber,
							title: step.problem?.title ?? step.solution?.title ?? 'Untitled',
							completed: Boolean(stepProgress?.epicCompletedAt),
							isCurrent:
								currentExercise === exercise.exerciseNumber &&
								currentStep === step.stepNumber,
						}
					}),
				})),
			}
			console.log(JSON.stringify(output, null, 2))
			return { success: true }
		}

		if (!silent) {
			console.log(chalk.bold.cyan(`\n📚 ${config.title}\n`))
			if (config.subtitle) {
				console.log(chalk.gray(`  ${config.subtitle}\n`))
			}

			for (const exercise of exercises) {
				const exNum = exercise.exerciseNumber.toString().padStart(2, '0')
				const isCurrent = currentExercise === exercise.exerciseNumber

				// Calculate exercise completion
				const exerciseSteps = exercise.steps
				const completedSteps = exerciseSteps.filter((step) => {
					const stepProgress = progress.find(
						(p) =>
							p.type === 'step' &&
							p.exerciseNumber === exercise.exerciseNumber &&
							p.stepNumber === step.stepNumber,
					)
					return stepProgress?.epicCompletedAt
				}).length

				const allComplete = completedSteps === exerciseSteps.length
				const anyComplete = completedSteps > 0

				const exIcon = allComplete
					? chalk.green('✓')
					: anyComplete
						? chalk.yellow('◐')
						: chalk.gray('○')

				const currentIndicator = isCurrent ? chalk.cyan(' ← current') : ''
				const progressText = chalk.gray(
					`(${completedSteps}/${exerciseSteps.length})`,
				)

				console.log(
					`  ${exIcon} ${chalk.bold(`${exNum}. ${exercise.title}`)} ${progressText}${currentIndicator}`,
				)

				// Show steps
				for (const step of exerciseSteps) {
					const stepNum = step.stepNumber.toString().padStart(2, '0')
					const stepProgress = progress.find(
						(p) =>
							p.type === 'step' &&
							p.exerciseNumber === exercise.exerciseNumber &&
							p.stepNumber === step.stepNumber,
					)
					const isStepComplete = Boolean(stepProgress?.epicCompletedAt)
					const isStepCurrent = isCurrent && currentStep === step.stepNumber

					const stepIcon = isStepComplete ? chalk.green('✓') : chalk.gray('○')
					const stepTitle =
						step.problem?.title ?? step.solution?.title ?? 'Untitled'
					const stepCurrentIndicator = isStepCurrent
						? chalk.cyan(' ← current')
						: ''

					console.log(
						`      ${stepIcon} ${stepNum}. ${stepTitle}${stepCurrentIndicator}`,
					)
				}
			}
			console.log()
		}

		return { success: true }
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		if (!silent) {
			console.error(chalk.red(`❌ Failed to list exercises: ${message}`))
		}
		return {
			success: false,
			message,
			error: error instanceof Error ? error : new Error(message),
		}
	}
}

/**
 * Show detailed context for a specific exercise
 */
export async function showExercise(
	options: ExerciseContextOptions = {},
): Promise<ExercisesResult> {
	const { exerciseNumber, stepNumber, silent = false, json = false } = options

	try {
		const {
			init,
			getExercise,
			getPlaygroundApp,
			extractNumbersAndTypeFromAppNameOrPath,
		} = await import('@epic-web/workshop-utils/apps.server')
		const { getProgress } =
			await import('@epic-web/workshop-utils/epic-api.server')
		const path = await import('node:path')

		await init()

		const playgroundApp = await getPlaygroundApp()
		let targetExercise = exerciseNumber
		let targetStep = stepNumber

		// Default to current playground if no exercise specified
		if (targetExercise === undefined && playgroundApp) {
			const numbers = extractNumbersAndTypeFromAppNameOrPath(
				playgroundApp.appName,
			)
			if (numbers) {
				targetExercise = Number(numbers.exerciseNumber)
				targetStep = targetStep ?? Number(numbers.stepNumber)
			}
		}

		if (targetExercise === undefined || isNaN(targetExercise)) {
			throw new Error(
				'A valid exercise number is required. Provide it as an argument or set a playground first.',
			)
		}

		if (targetStep !== undefined && isNaN(targetStep)) {
			throw new Error('A valid step number is required when specifying a step.')
		}

		const exercise = await getExercise(targetExercise)
		if (!exercise) {
			throw new Error(`No exercise found for exercise number ${targetExercise}`)
		}

		const progress = await getProgress()

		// Read README content
		const readmeContent = await safeReadFile(
			path.join(exercise.fullPath, 'README.mdx'),
		)
		const finishedContent = await safeReadFile(
			path.join(exercise.fullPath, 'FINISHED.mdx'),
		)

		if (json) {
			const output = {
				exerciseNumber: exercise.exerciseNumber,
				title: exercise.title,
				fullPath: exercise.fullPath,
				instructions: readmeContent || null,
				finishedInstructions: finishedContent || null,
				steps: await Promise.all(
					exercise.steps.map(async (step) => {
						const stepProgress = progress.find(
							(p) =>
								p.type === 'step' &&
								p.exerciseNumber === exercise.exerciseNumber &&
								p.stepNumber === step.stepNumber,
						)
						return {
							stepNumber: step.stepNumber,
							title: step.problem?.title ?? step.solution?.title ?? 'Untitled',
							completed: Boolean(stepProgress?.epicCompletedAt),
							problem: step.problem
								? {
										fullPath: step.problem.fullPath,
										instructions: await safeReadFile(
											path.join(step.problem.fullPath, 'README.mdx'),
										),
									}
								: null,
							solution: step.solution
								? {
										fullPath: step.solution.fullPath,
										instructions: await safeReadFile(
											path.join(step.solution.fullPath, 'README.mdx'),
										),
									}
								: null,
						}
					}),
				),
			}
			console.log(JSON.stringify(output, null, 2))
			return { success: true }
		}

		if (!silent) {
			const exNum = exercise.exerciseNumber.toString().padStart(2, '0')
			console.log(
				chalk.bold.cyan(`\n📖 Exercise ${exNum}: ${exercise.title}\n`),
			)

			// If a specific step is requested, show detailed step info
			if (targetStep !== undefined) {
				const step = exercise.steps.find((s) => s.stepNumber === targetStep)
				if (!step) {
					throw new Error(
						`No step ${targetStep} found in exercise ${targetExercise}`,
					)
				}

				const stepNum = step.stepNumber.toString().padStart(2, '0')
				const stepTitle =
					step.problem?.title ?? step.solution?.title ?? 'Untitled'
				const stepProgress = progress.find(
					(p) =>
						p.type === 'step' &&
						p.exerciseNumber === exercise.exerciseNumber &&
						p.stepNumber === step.stepNumber,
				)

				console.log(chalk.bold(`  Step ${stepNum}: ${stepTitle}`))
				console.log(
					`  Status: ${stepProgress?.epicCompletedAt ? chalk.green('Completed') : chalk.yellow('In Progress')}`,
				)

				if (step.problem) {
					console.log(chalk.bold('\n  Problem:'))
					console.log(`    Path: ${step.problem.fullPath}`)
					const problemReadme = await safeReadFile(
						path.join(step.problem.fullPath, 'README.mdx'),
					)
					if (problemReadme) {
						console.log(chalk.gray('\n  Instructions (first 20 lines):'))
						const lines = problemReadme.split('\n').slice(0, 20)
						for (const line of lines) {
							console.log(chalk.gray(`    ${line}`))
						}
						if (problemReadme.split('\n').length > 20) {
							console.log(chalk.gray('    ...'))
						}
					}
				}

				if (step.solution) {
					console.log(chalk.bold('\n  Solution:'))
					console.log(`    Path: ${step.solution.fullPath}`)
				}
			} else {
				// Show exercise overview
				console.log(`  Path: ${exercise.fullPath}`)
				console.log(`  Steps: ${exercise.steps.length}`)

				// Calculate progress
				const completedSteps = exercise.steps.filter((step) => {
					const stepProgress = progress.find(
						(p) =>
							p.type === 'step' &&
							p.exerciseNumber === exercise.exerciseNumber &&
							p.stepNumber === step.stepNumber,
					)
					return stepProgress?.epicCompletedAt
				}).length

				console.log(`  Progress: ${completedSteps}/${exercise.steps.length}`)

				if (readmeContent) {
					console.log(chalk.bold('\n  Instructions (first 15 lines):'))
					const lines = readmeContent.split('\n').slice(0, 15)
					for (const line of lines) {
						console.log(chalk.gray(`    ${line}`))
					}
					if (readmeContent.split('\n').length > 15) {
						console.log(chalk.gray('    ...'))
					}
				}

				console.log(chalk.bold('\n  Steps:'))
				for (const step of exercise.steps) {
					const stepNum = step.stepNumber.toString().padStart(2, '0')
					const stepProgress = progress.find(
						(p) =>
							p.type === 'step' &&
							p.exerciseNumber === exercise.exerciseNumber &&
							p.stepNumber === step.stepNumber,
					)
					const icon = stepProgress?.epicCompletedAt
						? chalk.green('✓')
						: chalk.gray('○')
					const stepTitle =
						step.problem?.title ?? step.solution?.title ?? 'Untitled'
					console.log(`    ${icon} ${stepNum}. ${stepTitle}`)
				}
			}
			console.log()
		}

		return { success: true }
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		if (!silent) {
			console.error(chalk.red(`❌ Failed to show exercise: ${message}`))
		}
		return {
			success: false,
			message,
			error: error instanceof Error ? error : new Error(message),
		}
	}
}

async function safeReadFile(filePath: string): Promise<string | null> {
	const fs = await import('node:fs/promises')
	try {
		return await fs.readFile(filePath, 'utf-8')
	} catch {
		return null
	}
}
