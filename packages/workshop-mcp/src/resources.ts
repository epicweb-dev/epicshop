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
import {
	type McpServer,
	ResourceTemplate,
} from '@modelcontextprotocol/sdk/server/mcp.js'
import { type ReadResourceResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod/v3'
import { resourceDocs } from './server-metadata.ts'
import {
	handleWorkshopDirectory,
	type InputSchemaType,
	readInWorkshop,
	safeReadFile,
	workshopDirectoryInputSchema,
} from './utils.ts'

export const getWorkshopContextInputSchema = {
	workshopDirectory: workshopDirectoryInputSchema,
}

export async function getWorkshopContext({
	workshopDirectory,
}: InputSchemaType<typeof getWorkshopContextInputSchema>) {
	await handleWorkshopDirectory(workshopDirectory)
	const progress = await getProgress()

	const output = {
		meta: {
			'README.md': await readInWorkshop('README.md'),
			config: (
				JSON.parse((await readInWorkshop('package.json')) || '{}') as any
			).epicshop,
			instructions: {
				content: await readInWorkshop('exercises', 'README.mdx'),
				progress: progress.find((p) => p.type === 'instructions'),
			},
			finishedInstructions: {
				content: await readInWorkshop('exercises', 'FINISHED.mdx'),
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
	name: resourceDocs.workshop_context.name,
	description: resourceDocs.workshop_context.description,
	uriTemplate: workshopContextUriTemplate,
	getResource: getWorkshopContextResource,
	inputSchema: getWorkshopContextInputSchema,
}

const getExerciseContextInputSchema = {
	workshopDirectory: workshopDirectoryInputSchema,
	exerciseNumber: z.coerce
		.number()
		.optional()
		.describe(
			`Exercise number to fetch (defaults to the current playground exercise if omitted).`,
		),
}

async function getExerciseContext({
	workshopDirectory,
	exerciseNumber,
}: {
	workshopDirectory: string
	exerciseNumber?: number
}) {
	const { userHasAccess, authInfo, progress, numbers } =
		await getCommonContextData(workshopDirectory)

	let stepNumber = 1
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
		exerciseInfo: {
			number: exerciseNumber,
			intro: {
				content: await getFileContent(
					path.join(exercise.fullPath, 'README.mdx'),
				),
				transcripts: getTranscripts(
					exercise.instructionsEpicVideoEmbeds,
					videoInfos,
					userHasAccess,
				),
				progress: progress.find(
					(p) =>
						p.type === 'instructions' && p.exerciseNumber === exerciseNumber,
				),
			},
			outro: {
				content: await getFileContent(
					path.join(exercise.fullPath, 'FINISHED.mdx'),
				),
				transcripts: getTranscripts(
					exercise.finishedEpicVideoEmbeds,
					videoInfos,
					userHasAccess,
				),
				progress: progress.find(
					(p) => p.type === 'finished' && p.exerciseNumber === exerciseNumber,
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
								p.exerciseNumber === exerciseNumber &&
								p.stepNumber === app.stepNumber,
						),
						problem: {
							content: app.problem
								? await getFileContent(
										path.join(app.problem.fullPath, 'README.mdx'),
									)
								: 'No problem found',
							transcripts: getTranscripts(
								app.problem?.epicVideoEmbeds,
								videoInfos,
								userHasAccess,
							),
						},
						solution: {
							content: app.solution
								? await getFileContent(
										path.join(app.solution.fullPath, 'README.mdx'),
									)
								: 'No solution found',
							transcripts: getTranscripts(
								app.solution?.epicVideoEmbeds,
								videoInfos,
								userHasAccess,
							),
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
			exerciseNumber: String(context.exerciseInfo.number),
		}),
		mimeType: 'application/json',
		text: JSON.stringify(context),
	}
}

export const exerciseContextResource = {
	name: resourceDocs.exercise_context.name,
	description: resourceDocs.exercise_context.description,
	uriTemplate: exerciseContextUriTemplate,
	getResource: getExerciseContextResource,
	inputSchema: getExerciseContextInputSchema,
}

// Common helper functions extracted from getExerciseContext
async function getCommonContextData(workshopDirectory: string) {
	await handleWorkshopDirectory(workshopDirectory)
	const userHasAccess = await userHasAccessToWorkshop()
	const authInfo = await getAuthInfo()
	const progress = await getProgress()
	const playgroundApp = await getPlaygroundApp()
	const numbers = playgroundApp
		? extractNumbersAndTypeFromAppNameOrPath(playgroundApp.appName)
		: null

	return {
		userHasAccess,
		authInfo,
		progress,
		playgroundApp,
		numbers,
	}
}

function getTranscripts(
	embeds: Array<string> | undefined,
	videoInfos: Record<string, any>,
	userHasAccess: boolean,
) {
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

const getExerciseStepContextInputSchema = {
	workshopDirectory: workshopDirectoryInputSchema,
	exerciseNumber: z.coerce
		.number()
		.describe('Exercise number to fetch (1-based).'),
	stepNumber: z.coerce
		.number()
		.describe('Step number to fetch within the exercise (1-based).'),
}

async function getExerciseStepContext({
	workshopDirectory,
	exerciseNumber,
	stepNumber,
}: {
	workshopDirectory: string
	exerciseNumber: number
	stepNumber: number
}) {
	const { userHasAccess, authInfo, progress, numbers } =
		await getCommonContextData(workshopDirectory)

	const isCurrentExercise =
		exerciseNumber === Number(numbers?.exerciseNumber) &&
		stepNumber === Number(numbers?.stepNumber)

	const exercise = await getExercise(exerciseNumber)
	invariant(exercise, `No exercise found for exercise number ${exerciseNumber}`)

	const step = exercise.steps.find((s) => s.stepNumber === stepNumber)
	invariant(
		step,
		`No step found for exercise ${exerciseNumber}, step ${stepNumber}`,
	)

	const videoInfos = await getEpicVideoInfos([
		...(step.problem?.epicVideoEmbeds ?? []),
		...(step.solution?.epicVideoEmbeds ?? []),
	])

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
				: 'currently set to a different exercise step',
		},
		exerciseInfo: {
			number: exerciseNumber,
			title: exercise.title,
		},
		stepInfo: {
			number: stepNumber,
			isCurrent: isCurrentExercise,
			progress: progress.find(
				(p) =>
					p.type === 'step' &&
					p.exerciseNumber === exerciseNumber &&
					p.stepNumber === stepNumber,
			),
			title: step.problem?.title ?? step.solution?.title ?? null,
		},
		problem: {
			content: step.problem
				? await getFileContent(path.join(step.problem.fullPath, 'README.mdx'))
				: 'No problem found',
			transcripts: getTranscripts(
				step.problem?.epicVideoEmbeds,
				videoInfos,
				userHasAccess,
			),
		},
		solution: {
			content: step.solution
				? await getFileContent(path.join(step.solution.fullPath, 'README.mdx'))
				: 'No solution found',
			transcripts: getTranscripts(
				step.solution?.epicVideoEmbeds,
				videoInfos,
				userHasAccess,
			),
		},
		notes: [] as Array<string>,
	}

	if (isCurrentExercise) {
		context.notes.push(
			`This is the current step the user is working on. The playground is set to exercise ${exerciseNumber}, step ${stepNumber}.`,
		)
	}

	return context
}

const exerciseStepContextUriTemplate = new ResourceTemplate(
	'epicshop://{workshopDirectory}/exercise/{exerciseNumber}/{stepNumber}',
	{ list: undefined },
)

async function getExerciseStepContextResource({
	workshopDirectory,
	exerciseNumber,
	stepNumber,
}: InputSchemaType<typeof getExerciseStepContextInputSchema>): Promise<
	ReadResourceResult['contents'][number]
> {
	const context = await getExerciseStepContext({
		workshopDirectory,
		exerciseNumber,
		stepNumber,
	})
	return {
		uri: exerciseStepContextUriTemplate.uriTemplate.expand({
			workshopDirectory,
			exerciseNumber: String(exerciseNumber),
			stepNumber: String(stepNumber),
		}),
		mimeType: 'application/json',
		text: JSON.stringify(context),
	}
}

export const exerciseStepContextResource = {
	name: resourceDocs.exercise_step_context.name,
	description: resourceDocs.exercise_step_context.description,
	uriTemplate: exerciseStepContextUriTemplate,
	getResource: getExerciseStepContextResource,
	inputSchema: getExerciseStepContextInputSchema,
}

const diffBetweenAppsInputSchema = {
	workshopDirectory: workshopDirectoryInputSchema,
	app1: z
		.string()
		.describe('First app ID (format: "02.03.problem" or "02.03.solution").'),
	app2: z
		.string()
		.describe('Second app ID (format: "02.03.problem" or "02.03.solution").'),
}

async function getDiffBetweenApps({
	workshopDirectory,
	app1,
	app2,
}: InputSchemaType<typeof diffBetweenAppsInputSchema>) {
	await handleWorkshopDirectory(workshopDirectory)

	const { getDiffOutputWithRelativePaths } =
		await import('@epic-web/workshop-utils/diff.server')

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
	name: resourceDocs.diff_between_apps.name,
	description: resourceDocs.diff_between_apps.description,
	uriTemplate: diffBetweenAppsUriTemplate,
	getResource: getDiffBetweenAppsResource,
	inputSchema: diffBetweenAppsInputSchema,
}

const getExerciseStepProgressDiffInputSchema = {
	workshopDirectory: workshopDirectoryInputSchema,
}

async function getExerciseStepProgressDiff({
	workshopDirectory,
}: InputSchemaType<typeof getExerciseStepProgressDiffInputSchema>) {
	await handleWorkshopDirectory(workshopDirectory)

	const { getDiffOutputWithRelativePaths } =
		await import('@epic-web/workshop-utils/diff.server')

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

const exerciseStepProgressDiffUriTemplate = new ResourceTemplate(
	'epicshop://{workshopDirectory}/exercise-step-progress-diff',
	{ list: undefined },
)

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

export const exerciseStepProgressDiffResource = {
	name: resourceDocs.exercise_step_progress_diff.name,
	description: resourceDocs.exercise_step_progress_diff.description,
	uriTemplate: exerciseStepProgressDiffUriTemplate,
	getResource: getExerciseStepProgressDiffResource,
	inputSchema: getExerciseStepProgressDiffInputSchema,
}

const getUserInfoInputSchema = {
	workshopDirectory: workshopDirectoryInputSchema,
}

const userInfoUri = new ResourceTemplate(
	'epicshop://{workshopDirectory}/user/info',
	{ list: undefined },
)

async function getUserInfoResource({
	workshopDirectory,
}: InputSchemaType<typeof getUserInfoInputSchema>) {
	const userInfo = await getUserInfo()
	return {
		uri: userInfoUri.uriTemplate.expand({
			workshopDirectory,
		}),
		mimeType: 'application/json',
		text: JSON.stringify(userInfo),
	}
}

export const userInfoResource = {
	name: resourceDocs.user_info.name,
	description: resourceDocs.user_info.description,
	uriTemplate: userInfoUri,
	getResource: getUserInfoResource,
	inputSchema: getUserInfoInputSchema,
}

const getUserAccessInputSchema = {
	workshopDirectory: workshopDirectoryInputSchema,
}

const userAccessUriTemplate = new ResourceTemplate(
	'epicshop://{workshopDirectory}/user/access',
	{ list: undefined },
)

async function getUserAccessResource({
	workshopDirectory,
}: InputSchemaType<typeof getUserAccessInputSchema>) {
	const userHasAccess = await userHasAccessToWorkshop()
	return {
		uri: userAccessUriTemplate.uriTemplate.expand({
			workshopDirectory,
		}),
		mimeType: 'application/json',
		text: JSON.stringify({ userHasAccess }),
	}
}

export const userAccessResource = {
	name: resourceDocs.user_access.name,
	description: resourceDocs.user_access.description,
	uriTemplate: userAccessUriTemplate,
	getResource: getUserAccessResource,
	inputSchema: getUserAccessInputSchema,
}

const userProgressInputSchema = {
	workshopDirectory: workshopDirectoryInputSchema,
}

const userProgressUriTemplate = new ResourceTemplate(
	'epicshop://{workshopDirectory}/user/progress',
	{ list: undefined },
)

async function getUserProgressResource({
	workshopDirectory,
}: InputSchemaType<typeof userProgressInputSchema>) {
	const userProgress = await getProgress()
	return {
		uri: userProgressUriTemplate.uriTemplate.expand({
			workshopDirectory,
		}),
		mimeType: 'application/json',
		text: JSON.stringify(userProgress),
	}
}

export const userProgressResource = {
	name: resourceDocs.user_progress.name,
	description: resourceDocs.user_progress.description,
	uriTemplate: userProgressUriTemplate,
	getResource: getUserProgressResource,
	inputSchema: userProgressInputSchema,
}

export function initResources(server: McpServer) {
	server.registerResource(
		workshopContextResource.name,
		workshopContextResource.uriTemplate,
		{ description: workshopContextResource.description },
		async (_uri, { workshopDirectory }) => {
			invariant(
				typeof workshopDirectory === 'string',
				'A single workshopDirectory is required',
			)
			workshopDirectory = await handleWorkshopDirectory(workshopDirectory)
			const resource = await workshopContextResource.getResource({
				workshopDirectory,
			})
			return { contents: [resource] }
		},
	)

	server.registerResource(
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
			workshopDirectory = await handleWorkshopDirectory(workshopDirectory)
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

	server.registerResource(
		exerciseStepContextResource.name,
		exerciseStepContextResource.uriTemplate,
		{ description: exerciseStepContextResource.description },
		async (
			_uri,
			{
				workshopDirectory,
				exerciseNumber: providedExerciseNumber,
				stepNumber: providedStepNumber,
			},
		) => {
			invariant(
				typeof workshopDirectory === 'string',
				'A single workshopDirectory is required',
			)
			invariant(
				typeof providedExerciseNumber === 'string',
				'A single exerciseNumber is required',
			)
			invariant(
				typeof providedStepNumber === 'string',
				'A single stepNumber is required',
			)
			const exerciseNumber = Number(providedExerciseNumber)
			const stepNumber = Number(providedStepNumber)
			invariant(!isNaN(exerciseNumber), 'exerciseNumber must be a number')
			invariant(!isNaN(stepNumber), 'stepNumber must be a number')
			invariant(
				exerciseNumber >= 0,
				'exerciseNumber must be greater than or equal to 0',
			)
			invariant(
				stepNumber >= 0,
				'stepNumber must be greater than or equal to 0',
			)
			workshopDirectory = await handleWorkshopDirectory(workshopDirectory)
			return {
				contents: [
					await exerciseStepContextResource.getResource({
						workshopDirectory,
						exerciseNumber,
						stepNumber,
					}),
				],
			}
		},
	)

	server.registerResource(
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
			workshopDirectory = await handleWorkshopDirectory(workshopDirectory)
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

	server.registerResource(
		exerciseStepProgressDiffResource.name,
		exerciseStepProgressDiffResource.uriTemplate,
		{ description: exerciseStepProgressDiffResource.description },
		async (_uri, { workshopDirectory }) => {
			invariant(
				typeof workshopDirectory === 'string',
				'A single workshopDirectory is required',
			)
			workshopDirectory = await handleWorkshopDirectory(workshopDirectory)
			return {
				contents: [
					await exerciseStepProgressDiffResource.getResource({
						workshopDirectory,
					}),
				],
			}
		},
	)

	server.registerResource(
		userInfoResource.name,
		userInfoResource.uriTemplate,
		{ description: userInfoResource.description },
		async (_uri, { workshopDirectory }) => {
			invariant(
				typeof workshopDirectory === 'string',
				'A single workshopDirectory is required',
			)
			return {
				contents: [await userInfoResource.getResource({ workshopDirectory })],
			}
		},
	)

	server.registerResource(
		userAccessResource.name,
		userAccessResource.uriTemplate,
		{ description: userAccessResource.description },
		async (_uri, { workshopDirectory }) => {
			invariant(
				typeof workshopDirectory === 'string',
				'A single workshopDirectory is required',
			)
			workshopDirectory = await handleWorkshopDirectory(workshopDirectory)
			return {
				contents: [await userAccessResource.getResource({ workshopDirectory })],
			}
		},
	)

	server.registerResource(
		userProgressResource.name,
		userProgressResource.uriTemplate,
		{ description: userProgressResource.description },
		async (_uri, { workshopDirectory }) => {
			invariant(
				typeof workshopDirectory === 'string',
				'A single workshopDirectory is required',
			)
			workshopDirectory = await handleWorkshopDirectory(workshopDirectory)
			return {
				contents: [
					await userProgressResource.getResource({ workshopDirectory }),
				],
			}
		},
	)
}
