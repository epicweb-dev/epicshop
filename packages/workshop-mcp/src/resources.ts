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
} from '@epic-web/workshop-utils/epic-api.server'
import {
	type McpServer,
	ResourceTemplate,
} from '@modelcontextprotocol/sdk/server/mcp.js'
import { type ReadResourceResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import {
	handleWorkshopDirectory,
	type InputSchemaType,
	safeReadFile,
} from './utils.js'

export const getWorkshopContextInputSchema = {
	workshopDirectory: z
		.string()
		.describe(
			'The workshop directory (the root directory of the workshop repo.).',
		),
}

export async function getWorkshopContext({
	workshopDirectory,
}: InputSchemaType<typeof getWorkshopContextInputSchema>) {
	const workshopRoot = await handleWorkshopDirectory(workshopDirectory)
	const inWorkshop = (...d: Array<string>) => path.join(workshopRoot, ...d)
	const readInWorkshop = (...d: Array<string>) => safeReadFile(inWorkshop(...d))

	const output = {
		meta: {
			'README.md': await readInWorkshop('README.md'),
			config: (
				JSON.parse((await readInWorkshop('package.json')) || '{}') as any
			).epicshop,
			instructions: await readInWorkshop('exercise', 'README.mdx'),
			finishedInstructions: await readInWorkshop('exercise', 'FINISHED.mdx'),
		},
		exercises: [] as Array<any>,
	}

	const exercises = await getExercises()
	for (const exercise of exercises) {
		const exerciseInfo = {
			fullPath: exercise.fullPath,
			exerciseNumber: exercise.exerciseNumber,
			title: exercise.title,
			instructions: await safeReadFile(
				path.join(exercise.fullPath, 'README.mdx'),
			),
			finishedInstructions: await safeReadFile(
				path.join(exercise.fullPath, 'FINISHED.mdx'),
			),
			steps: exercise.steps.map((step) => {
				return {
					stepNumber: step.stepNumber,
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

const workshopContextUriTemplate = new ResourceTemplate(
	'epicshop://{workshopDirectory}/workshop-context',
	{ list: undefined },
)

export async function getWorkshopContextResource({
	workshopDirectory,
}: InputSchemaType<typeof getWorkshopContextInputSchema>): Promise<
	ReadResourceResult['contents'][number]
> {
	return {
		uri: workshopContextUriTemplate.uriTemplate.expand({
			workshopDirectory,
		}),
		mimeType: 'application/json',
		text: JSON.stringify(await getWorkshopContext({ workshopDirectory })),
	}
}

export const workshopContextResource = {
	name: 'workshop_context',
	description: 'The context of the workshop',
	uriTemplate: workshopContextUriTemplate,
	getResource: getWorkshopContextResource,
	inputSchema: getWorkshopContextInputSchema,
}

const getExerciseContextInputSchema = {
	workshopDirectory: z
		.string()
		.describe(
			'The workshop directory (the root directory of the workshop repo.).',
		),
	exerciseNumber: z.coerce
		.number()
		.optional()
		.describe(
			`The exercise number to get the context for (defaults to the exercise number the playground is currently set to)`,
		),
}

async function getExerciseContext({
	workshopDirectory,
	exerciseNumber,
}: {
	workshopDirectory: string
	exerciseNumber?: number
}) {
	await handleWorkshopDirectory(workshopDirectory)
	const userHasAccess = await userHasAccessToWorkshop()
	const authInfo = await getAuthInfo()
	let stepNumber = 1
	const playgroundApp = await getPlaygroundApp()
	invariant(playgroundApp, 'No playground app found')
	const numbers = extractNumbersAndTypeFromAppNameOrPath(playgroundApp.appName)
	const isCurrentExercise =
		exerciseNumber === undefined ||
		exerciseNumber === Number(numbers?.exerciseNumber)
	if (exerciseNumber === undefined) {
		invariant(numbers, 'No numbers found in playground app name')
		exerciseNumber = Number(numbers.exerciseNumber)
		stepNumber = Number(numbers.stepNumber)
	}
	const exercise = await getExercise(exerciseNumber)
	invariant(exercise, `No exercise found for exercise number ${exerciseNumber}`)

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
						exerciseNumber,
						stepNumber,
					}
				: 'currently set to a different exercise',
		},
		exerciseBackground: {
			number: exerciseNumber,
			intro: {
				content: await getFileContent(
					path.join(exercise.fullPath, 'README.mdx'),
				),
				transcripts: getTranscripts(exercise.instructionsEpicVideoEmbeds),
			},
			outro: {
				content: await getFileContent(
					path.join(exercise.fullPath, 'FINISHED.mdx'),
				),
				transcripts: getTranscripts(exercise.finishedEpicVideoEmbeds),
			},
		},
		steps: exercise.steps
			? await Promise.all(
					exercise.steps.map(async (app) => ({
						number: app.stepNumber,
						isCurrent: isCurrentExercise && app.stepNumber === stepNumber,
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

const exerciseContextUriTemplate = new ResourceTemplate(
	'epicshop://{workshopDirectory}/exercise/{exerciseNumber}',
	{ list: undefined },
)

async function getExerciseContextResource({
	workshopDirectory,
	exerciseNumber,
}: {
	workshopDirectory: string
	exerciseNumber?: number
}): Promise<ReadResourceResult['contents'][number]> {
	const context = await getExerciseContext({
		workshopDirectory,
		exerciseNumber,
	})
	return {
		uri: exerciseContextUriTemplate.uriTemplate.expand({
			workshopDirectory,
			exerciseNumber: String(context.exerciseBackground.number),
		}),
		mimeType: 'application/json',
		text: JSON.stringify(context),
	}
}

export const exerciseContextResource = {
	name: 'exercise_context',
	description: 'The context of the exercise',
	uriTemplate: exerciseContextUriTemplate,
	getResource: getExerciseContextResource,
	inputSchema: getExerciseContextInputSchema,
}

const diffBetweenAppsInputSchema = {
	workshopDirectory: z.string().describe('The workshop directory'),
	app1: z.string().describe('The ID of the first app'),
	app2: z.string().describe('The ID of the second app'),
}

async function getDiffBetweenApps({
	workshopDirectory,
	app1,
	app2,
}: InputSchemaType<typeof diffBetweenAppsInputSchema>) {
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

async function getDiffBetweenAppsResource({
	workshopDirectory,
	app1,
	app2,
}: InputSchemaType<typeof diffBetweenAppsInputSchema>): Promise<
	ReadResourceResult['contents'][number]
> {
	return {
		uri: diffBetweenAppsUriTemplate.uriTemplate.expand({
			workshopDirectory,
			app1,
			app2,
		}),
		mimeType: 'application/json',
		text: JSON.stringify(
			await getDiffBetweenApps({ workshopDirectory, app1, app2 }),
		),
	}
}

const diffBetweenAppsUriTemplate = new ResourceTemplate(
	'epicshop://{workshopDirectory}/diff-between-apps/{app1}__vs___{app2}',
	{ list: undefined },
)

export const diffBetweenAppsResource = {
	name: 'diff_between_apps',
	description: 'The diff between two apps',
	uriTemplate: diffBetweenAppsUriTemplate,
	getResource: getDiffBetweenAppsResource,
	inputSchema: diffBetweenAppsInputSchema,
}

const getExerciseStepProgressDiffInputSchema = {
	workshopDirectory: z.string().describe('The workshop directory'),
}

async function getExerciseStepProgressDiff({
	workshopDirectory,
}: InputSchemaType<typeof getExerciseStepProgressDiffInputSchema>) {
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

async function getExerciseStepProgressDiffResource({
	workshopDirectory,
}: InputSchemaType<typeof getExerciseStepProgressDiffInputSchema>): Promise<
	ReadResourceResult['contents'][number]
> {
	return {
		uri: exerciseStepProgressDiffUriTemplate.uriTemplate.expand({
			workshopDirectory,
		}),
		mimeType: 'application/json',
		text: JSON.stringify(
			await getExerciseStepProgressDiff({ workshopDirectory }),
		),
	}
}

const exerciseStepProgressDiffUriTemplate = new ResourceTemplate(
	'epicshop://{workshopDirectory}/exercise-step-progress-diff',
	{ list: undefined },
)

export const exerciseStepProgressDiffResource = {
	name: 'exercise_step_progress_diff',
	description: 'The diff between the current exercise step and the solution',
	uriTemplate: exerciseStepProgressDiffUriTemplate,
	getResource: getExerciseStepProgressDiffResource,
	inputSchema: getExerciseStepProgressDiffInputSchema,
}

export function initResources(server: McpServer) {
	server.resource(
		workshopContextResource.name,
		workshopContextResource.uriTemplate,
		{ description: workshopContextResource.description },
		async (_uri, { workshopDirectory }) => {
			invariant(
				typeof workshopDirectory === 'string',
				'A single workshopDirectory is required',
			)
			const resource = await workshopContextResource.getResource({
				workshopDirectory,
			})
			return { contents: [resource] }
		},
	)

	server.resource(
		exerciseContextResource.name,
		exerciseContextResource.uriTemplate,
		{ description: exerciseContextResource.description },
		async (
			_uri,
			{ workshopDirectory, exerciseNumber: providedExerciseNumber },
		) => {
			invariant(
				typeof workshopDirectory === 'string',
				'A single workshopDirectory is required',
			)
			invariant(
				typeof providedExerciseNumber === 'string',
				'A single exerciseNumber is required',
			)
			const exerciseNumber = Number(providedExerciseNumber)
			invariant(!isNaN(exerciseNumber), 'exerciseNumber must be a number')
			invariant(
				exerciseNumber >= 0,
				'exerciseNumber must be greater than or equal to 0',
			)
			return {
				contents: [
					await exerciseContextResource.getResource({
						workshopDirectory,
						exerciseNumber,
					}),
				],
			}
		},
	)

	server.resource(
		diffBetweenAppsResource.name,
		diffBetweenAppsResource.uriTemplate,
		{ description: diffBetweenAppsResource.description },
		async (_uri, { workshopDirectory, app1, app2 }) => {
			invariant(
				typeof workshopDirectory === 'string',
				'A single workshopDirectory is required',
			)
			invariant(typeof app1 === 'string', 'A single app1 is required')
			invariant(typeof app2 === 'string', 'A single app2 is required')
			return {
				contents: [
					await diffBetweenAppsResource.getResource({
						workshopDirectory,
						app1,
						app2,
					}),
				],
			}
		},
	)

	server.resource(
		exerciseStepProgressDiffResource.name,
		exerciseStepProgressDiffResource.uriTemplate,
		{ description: exerciseStepProgressDiffResource.description },
		async (_uri, { workshopDirectory }) => {
			invariant(
				typeof workshopDirectory === 'string',
				'A single workshopDirectory is required',
			)
			return {
				contents: [
					await exerciseStepProgressDiffResource.getResource({
						workshopDirectory,
					}),
				],
			}
		},
	)
}
