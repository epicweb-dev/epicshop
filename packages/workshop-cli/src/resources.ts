import path from 'node:path'
import { invariant } from '@epic-web/invariant'
import {
	extractNumbersAndTypeFromAppNameOrPath,
	findSolutionDir,
	getApps,
	getExercise,
	getExercises,
	getFullPathFromAppName,
	getPlaygroundApp,
	isExerciseStepApp,
	isPlaygroundApp,
} from '@epic-web/workshop-utils/apps.server'
import { getAuthInfo } from '@epic-web/workshop-utils/db.server'
import {
	getEpicVideoInfos,
	userHasAccessToWorkshop,
	getUserInfo,
	getProgress,
} from '@epic-web/workshop-utils/epic-api.server'
import { z } from 'zod'
import {
	handleWorkshopDirectory,
	type InputSchemaType,
	safeReadFile,
	workshopDirectoryInputSchema,
} from './utils.js'

export const getWorkshopContextSchema = z.object({
	workshopDirectory: workshopDirectoryInputSchema,
})

export async function getWorkshopContext(input: z.infer<typeof getWorkshopContextSchema>) {
	const { workshopDirectory } = input
	const workshopRoot = await handleWorkshopDirectory(workshopDirectory)
	const inWorkshop = (...d: Array<string>) => path.join(workshopRoot, ...d)
	const readInWorkshop = (...d: Array<string>) => safeReadFile(inWorkshop(...d))
	const progress = await getProgress()

	const output = {
		meta: {
			'README.md': await readInWorkshop('README.md'),
			config: (
				JSON.parse((await readInWorkshop('package.json')) || '{}') as any
			).epicshop,
			instructions: {
				content: await readInWorkshop('exercise', 'README.mdx'),
				progress: progress.find((p) => p.type === 'instructions'),
			},
			finishedInstructions: {
				content: await readInWorkshop('exercise', 'FINISHED.mdx'),
				progress: progress.find((p) => p.type === 'finished'),
			},
		},
		exercises: [] as Array<any>,
	}

	const exercises = await getExercises()
	for (const exercise of exercises) {
		const exerciseInfo = {
			fullPath: exercise.fullPath,
			exerciseNumber: exercise.exerciseNumber,
			title: exercise.title,
			instructions: {
				content: await safeReadFile(path.join(exercise.fullPath, 'README.mdx')),
				progress: progress.find(
					(p) =>
						p.type === 'instructions' &&
						p.exerciseNumber === exercise.exerciseNumber,
				),
			},
			finishedInstructions: {
				content: await safeReadFile(
					path.join(exercise.fullPath, 'FINISHED.mdx'),
				),
				progress: progress.find(
					(p) =>
						p.type === 'finished' &&
						p.exerciseNumber === exercise.exerciseNumber,
				),
			},
			steps: exercise.steps.map((step) => {
				return {
					stepNumber: step.stepNumber,
					progress: progress.find(
						(p) =>
							p.type === 'step' &&
							p.exerciseNumber === exercise.exerciseNumber &&
							p.stepNumber === step.stepNumber,
					),
					title: step.problem?.title ?? step.solution?.title ?? null,
					problem: step.problem
						? {
								fullPath: step.problem.fullPath,
								testConfig: step.problem.test,
								devConfig: step.problem.dev,
							}
						: 'No problem app',
					solution: step.solution
						? {
								fullPath: step.solution.fullPath,
								testConfig: step.solution.test,
								devConfig: step.solution.dev,
							}
						: 'No solution app',
				}
			}),
		}
		output.exercises.push(exerciseInfo)
	}

	return output
}

export const getExerciseContextSchema = z.object({
	workshopDirectory: workshopDirectoryInputSchema,
	exerciseNumber: z.coerce
		.number()
		.optional()
		.describe(
			`The exercise number to get the context for (defaults to the exercise number the playground is currently set to)`,
		),
})

export async function getExerciseContext(input: z.infer<typeof getExerciseContextSchema>) {
	const { workshopDirectory, exerciseNumber } = input
	await handleWorkshopDirectory(workshopDirectory)
	const userHasAccess = await userHasAccessToWorkshop()
	const authInfo = await getAuthInfo()
	const progress = await getProgress()
	let stepNumber = 1
	const playgroundApp = await getPlaygroundApp()
	invariant(playgroundApp, 'No playground app found')
	const numbers = extractNumbersAndTypeFromAppNameOrPath(playgroundApp.appName)
	const isCurrentExercise =
		exerciseNumber === undefined ||
		exerciseNumber === Number(numbers?.exerciseNumber)
	let resolvedExerciseNumber = exerciseNumber
	if (exerciseNumber === undefined) {
		invariant(numbers, 'No numbers found in playground app name')
		resolvedExerciseNumber = Number(numbers.exerciseNumber)
		stepNumber = Number(numbers.stepNumber)
	}
	const exercise = await getExercise(resolvedExerciseNumber!)
	invariant(exercise, `No exercise found for exercise number ${resolvedExerciseNumber}`)

	const videoInfos = await getEpicVideoInfos([
		...(exercise.instructionsEpicVideoEmbeds ?? []),
		...exercise.steps.flatMap((s) => s.problem?.epicVideoEmbeds ?? []),
		...exercise.steps.flatMap((s) => s.solution?.epicVideoEmbeds ?? []),
		...(exercise.finishedEpicVideoEmbeds ?? []),
	])

	function getTranscripts(embeds?: Array<string>) {
		if (!embeds) return []
		if (!userHasAccess && embeds.length) {
			return [
				{
					message: `User must upgrade before they can get access to ${embeds.length} transcript${embeds.length === 1 ? '' : 's'}.`,
				},
			]
		}
		return embeds.map((embed) => {
			const info = videoInfos[embed]
			if (info) {
				if (info.status === 'error') {
					if (info.type === 'region-restricted') {
						return {
							embed,
							status: 'error',
							type: info.type,
							requestedCountry: info.requestCountry,
							restrictedCountry: info.restrictedCountry,
						}
					} else {
						return {
							embed,
							status: 'error',
							type: info.type,
							statusCode: info.statusCode,
							statusText: info.statusText,
						}
					}
				} else {
					return {
						embed,
						status: 'success',
						transcript: info.transcript,
					}
				}
			} else {
				return {
					embed,
					status: 'error',
					type: 'not-found',
					message: 'No transcript found',
				}
			}
		})
	}

	async function getFileContent(filePath: string) {
		return {
			path: filePath,
			content: (await safeReadFile(filePath)) ?? 'None found',
		}
	}

	const context = {
		currentContext: {
			user: {
				hasAccess: userHasAccess,
				isAuthenticated: Boolean(authInfo),
				email: authInfo?.email,
			},
			playground: isCurrentExercise
				? {
						exerciseNumber: resolvedExerciseNumber,
						stepNumber,
					}
				: 'currently set to a different exercise',
		},
		exerciseInfo: {
			number: resolvedExerciseNumber,
			intro: {
				content: await getFileContent(
					path.join(exercise.fullPath, 'README.mdx'),
				),
				transcripts: getTranscripts(exercise.instructionsEpicVideoEmbeds),
				progress: progress.find(
					(p) =>
						p.type === 'instructions' && p.exerciseNumber === resolvedExerciseNumber,
				),
			},
			outro: {
				content: await getFileContent(
					path.join(exercise.fullPath, 'FINISHED.mdx'),
				),
				transcripts: getTranscripts(exercise.finishedEpicVideoEmbeds),
				progress: progress.find(
					(p) => p.type === 'finished' && p.exerciseNumber === resolvedExerciseNumber,
				),
			},
		},
		steps: exercise.steps
			? await Promise.all(
					exercise.steps.map(async (app) => ({
						number: app.stepNumber,
						isCurrent: isCurrentExercise && app.stepNumber === stepNumber,
						progress: progress.find(
							(p) =>
								p.type === 'step' &&
								p.exerciseNumber === resolvedExerciseNumber &&
								p.stepNumber === app.stepNumber,
						),
						problem: {
							content: app.problem
								? await getFileContent(
										path.join(app.problem.fullPath, 'README.mdx'),
									)
								: 'No problem found',
							transcripts: getTranscripts(app.problem?.epicVideoEmbeds),
						},
						solution: {
							content: app.solution
								? await getFileContent(
										path.join(app.solution.fullPath, 'README.mdx'),
									)
								: 'No solution found',
							transcripts: getTranscripts(app.solution?.epicVideoEmbeds),
						},
					})),
				)
			: [],
		notes: [] as Array<string>,
	}

	if (exercise.steps) {
		if (isCurrentExercise) {
			context.notes.push(
				`Reminder, the current step is ${stepNumber} of ${exercise.steps.length + 1}. The most relevant information will be in the context above within the current step.`,
			)
		}
	} else {
		context.notes.push('Unusually, this exercise has no steps.')
	}

	return context
}

export const getDiffBetweenAppsSchema = z.object({
	workshopDirectory: workshopDirectoryInputSchema,
	app1: z.string().describe('The ID of the first app'),
	app2: z.string().describe('The ID of the second app'),
})

export async function getDiffBetweenApps(input: z.infer<typeof getDiffBetweenAppsSchema>) {
	const { workshopDirectory, app1, app2 } = input
	await handleWorkshopDirectory(workshopDirectory)

	const { getDiffOutputWithRelativePaths } = await import(
		'@epic-web/workshop-utils/diff.server'
	)

	const app1Name = extractNumbersAndTypeFromAppNameOrPath(app1)
	const app2Name = extractNumbersAndTypeFromAppNameOrPath(app2)

	const apps = await getApps()
	const app1App = apps
		.filter(isExerciseStepApp)
		.find(
			(a) =>
				a.exerciseNumber === Number(app1Name?.exerciseNumber) &&
				a.stepNumber === Number(app1Name?.stepNumber) &&
				a.type === app1Name?.type,
		)
	const app2App = apps
		.filter(isExerciseStepApp)
		.find(
			(a) =>
				a.exerciseNumber === Number(app2Name?.exerciseNumber) &&
				a.stepNumber === Number(app2Name?.stepNumber) &&
				a.type === app2Name?.type,
		)

	invariant(app1App, `No app found for ${app1}`)
	invariant(app2App, `No app found for ${app2}`)

	const diffCode = await getDiffOutputWithRelativePaths(app1App, app2App)

	if (!diffCode) return 'No changes'

	return diffCode
}

export const getExerciseStepProgressDiffSchema = z.object({
	workshopDirectory: workshopDirectoryInputSchema,
})

export async function getExerciseStepProgressDiff(input: z.infer<typeof getExerciseStepProgressDiffSchema>) {
	const { workshopDirectory } = input
	await handleWorkshopDirectory(workshopDirectory)

	const { getDiffOutputWithRelativePaths } = await import(
		'@epic-web/workshop-utils/diff.server'
	)

	const apps = await getApps()
	const playgroundApp = apps.find(isPlaygroundApp)

	invariant(playgroundApp, 'No playground app found')

	const baseApp = playgroundApp
	const solutionDir = await findSolutionDir({
		fullPath: await getFullPathFromAppName(playgroundApp.appName),
	})
	const headApp = apps.find((a) => a.fullPath === solutionDir)

	invariant(headApp, 'No playground solution app found')

	const diffCode = await getDiffOutputWithRelativePaths(baseApp, headApp)

	if (!diffCode) return 'No changes'

	return diffCode
}

export const getUserInfoSchema = z.object({
	workshopDirectory: workshopDirectoryInputSchema,
})

export async function getUserInfoResource(input: z.infer<typeof getUserInfoSchema>) {
	const { workshopDirectory } = input
	await handleWorkshopDirectory(workshopDirectory)
	const userInfo = await getUserInfo()
	return userInfo
}

export const getUserAccessSchema = z.object({
	workshopDirectory: workshopDirectoryInputSchema,
})

export async function getUserAccessResource(input: z.infer<typeof getUserAccessSchema>) {
	const { workshopDirectory } = input
	await handleWorkshopDirectory(workshopDirectory)
	const userAccess = await userHasAccessToWorkshop()
	return { hasAccess: userAccess }
}

export const getUserProgressSchema = z.object({
	workshopDirectory: workshopDirectoryInputSchema,
})

export async function getUserProgressResource(input: z.infer<typeof getUserProgressSchema>) {
	const { workshopDirectory } = input
	await handleWorkshopDirectory(workshopDirectory)
	const progress = await getProgress()
	return progress
}