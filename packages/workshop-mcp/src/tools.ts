import path from 'node:path'
import { invariant } from '@epic-web/invariant'
import {
	getAppByName,
	getAppDisplayName,
	getApps,
	getExercise,
	getExerciseApp,
	getExercises,
	getPlaygroundApp,
	getPlaygroundAppName,
	getSavedPlaygrounds,
	isExerciseStepApp,
	isProblemApp,
	setPlayground,
	type ExerciseStepApp,
} from '@epic-web/workshop-utils/apps.server'
import { deleteCache } from '@epic-web/workshop-utils/cache.server'
import { getWorkshopConfig } from '@epic-web/workshop-utils/config.server'
import {
	getAuthInfo,
	getPreferences,
	logout,
	setAuthInfo,
} from '@epic-web/workshop-utils/db.server'
import { getDiffFiles } from '@epic-web/workshop-utils/diff.server'
import {
	getProgress,
	getUserInfo,
	updateProgress,
} from '@epic-web/workshop-utils/epic-api.server'
import { launchEditor } from '@epic-web/workshop-utils/launch-editor.server'
import { createUIResource } from '@mcp-ui/server'
import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
	type CallToolResult,
	type ReadResourceResult,
} from '@modelcontextprotocol/sdk/types.js'
import * as client from 'openid-client'
import { z } from 'zod/v3'
import { quizMe, quizMeInputSchema } from './prompts.ts'
import {
	diffBetweenAppsResource,
	exerciseContextResource,
	exerciseStepContextResource,
	exerciseStepProgressDiffResource,
	userAccessResource,
	userInfoResource,
	userProgressResource,
	workshopContextResource,
} from './resources.ts'
import {
	formatToolDescription,
	toolDocs,
	type ToolDoc,
} from './server-metadata.ts'
import {
	handleWorkshopDirectory,
	readInWorkshop,
	safeReadFile,
	workshopDirectoryInputSchema,
} from './utils.ts'

// not enough support for this yet
const clientSupportsEmbeddedResources = false

type ToolName = keyof typeof toolDocs

type ToolResponseOptions = {
	toolName: ToolName
	summary: string
	statusEmoji?: string | null
	details?: Array<string>
	nextSteps?: Array<string>
	includeMetaNextSteps?: boolean
	content?: CallToolResult['content']
	structuredContent?: Record<string, unknown>
}

function formatToolResponseText({
	title,
	summary,
	details,
	nextSteps,
}: {
	title: string
	summary: string
	details?: Array<string>
	nextSteps?: Array<string>
}) {
	const lines = [`## ${title}`, '', summary]

	if (details?.length) {
		lines.push('', ...details)
	}

	if (nextSteps?.length) {
		lines.push('', 'Next steps:')
		for (const step of nextSteps) {
			lines.push(`- ${step}`)
		}
	}

	return lines.join('\n').trim()
}

function createToolResponse({
	toolName,
	summary,
	details,
	nextSteps,
	includeMetaNextSteps = true,
	content = [],
	structuredContent,
	statusEmoji = '✅',
}: ToolResponseOptions): CallToolResult {
	const meta = toolDocs[toolName] as ToolDoc
	const steps = nextSteps ?? (includeMetaNextSteps ? meta.nextSteps : [])
	const summaryLine =
		statusEmoji === null ? summary : `${statusEmoji} ${summary}`
	const text = formatToolResponseText({
		title: meta.title,
		summary: summaryLine,
		details,
		nextSteps: steps,
	})
	return {
		content: [{ type: 'text', text }, ...content],
		structuredContent,
	}
}

function createToolErrorResult(
	toolName: ToolName,
	error: unknown,
): CallToolResult {
	const meta = toolDocs[toolName] as any
	const message = error instanceof Error ? error.message : String(error)
	const nextSteps = meta.errorNextSteps ?? meta.nextSteps
	const response = createToolResponse({
		toolName,
		summary: `Error: ${message}`,
		statusEmoji: '⚠️',
		nextSteps,
		includeMetaNextSteps: false,
		structuredContent: {
			tool: toolName,
			error: message,
			nextSteps,
		},
	})
	return { ...response, isError: true }
}

function formatSavedPlaygroundTimestamp(createdAt: string) {
	const createdAtDate = new Date(createdAt)
	if (Number.isNaN(createdAtDate.getTime())) return createdAt
	return new Intl.DateTimeFormat(undefined, {
		dateStyle: 'medium',
		timeStyle: 'short',
	}).format(createdAtDate)
}

function parseResourceText(resource: ReadResourceResult['contents'][number]) {
	if ('text' in resource && typeof resource.text === 'string') {
		try {
			return JSON.parse(resource.text)
		} catch {
			return resource.text
		}
	}
	return null
}

function createResourceStructuredContent(
	resource: ReadResourceResult['contents'][number],
) {
	return {
		uri: resource.uri,
		mimeType: resource.mimeType,
		data: parseResourceText(resource),
	}
}

function registerTool(
	server: McpServer,
	toolName: ToolName,
	inputSchema: Record<string, z.ZodTypeAny>,
	handler: (args: any) => Promise<CallToolResult>,
) {
	const meta = toolDocs[toolName] as ToolDoc
	return (server as any).registerTool(
		toolName,
		{
			title: meta.title,
			description: formatToolDescription(meta),
			inputSchema,
			annotations: meta.annotations,
		},
		async (args: unknown) => {
			try {
				return await handler(args as Record<string, unknown>)
			} catch (error) {
				return createToolErrorResult(toolName, error)
			}
		},
	)
}

export function initTools(server: McpServer) {
	registerTool(
		server,
		'login',
		{
			workshopDirectory: workshopDirectoryInputSchema,
		},
		async ({ workshopDirectory }) => {
			await handleWorkshopDirectory(workshopDirectory)
			const {
				product: { host },
			} = getWorkshopConfig()
			const ISSUER = `https://${host}/oauth`
			const config = await client.discovery(new URL(ISSUER), 'EPICSHOP_APP')
			const deviceResponse = await client.initiateDeviceAuthorization(
				config,
				{},
			)

			void handleAuthFlow().catch(() => {})

			const verificationUrl = deviceResponse.verification_uri_complete
			const userCode = deviceResponse.user_code
			return createToolResponse({
				toolName: 'login',
				summary: 'Login started. Ask the user to complete device verification.',
				details: [
					`Verification URL: ${verificationUrl}`,
					`User code: ${userCode}`,
					`Expires in: ${deviceResponse.expires_in} seconds`,
				],
				structuredContent: {
					verificationUrl,
					userCode,
					expiresInSeconds: deviceResponse.expires_in,
				},
			})

			async function handleAuthFlow() {
				const UserInfoSchema = z.object({
					id: z.string(),
					email: z.string(),
					name: z.string().nullable().optional(),
				})

				const timeout = setTimeout(() => {
					void server.server
						.notification({
							method: 'notifications/message',
							params: {
								level: 'warning',
								data: 'Device authorization timed out',
							},
						})
						.catch(() => {})
				}, deviceResponse.expires_in * 1000)

				try {
					const tokenSet = await client.pollDeviceAuthorizationGrant(
						config,
						deviceResponse,
					)
					clearTimeout(timeout)

					if (!tokenSet) {
						await server.server.notification({
							method: 'notifications/message',
							params: {
								level: 'error',
								data: 'No token set',
							},
						})
						return
					}

					const protectedResourceResponse = await client.fetchProtectedResource(
						config,
						tokenSet.access_token,
						new URL(`${ISSUER}/userinfo`),
						'GET',
					)
					const userinfoRaw = await protectedResourceResponse.json()
					const userinfoResult = UserInfoSchema.safeParse(userinfoRaw)
					if (!userinfoResult.success) {
						await server.server.notification({
							method: 'notifications/message',
							params: {
								level: 'error',
								data: `Failed to parse user info: ${userinfoResult.error.message}`,
							},
						})
						return
					}
					const userinfo = userinfoResult.data

					await setAuthInfo({
						id: userinfo.id,
						tokenSet,
						email: userinfo.email,
						name: userinfo.name,
					})

					await getUserInfo({ forceFresh: true })

					await server.server.notification({
						method: 'notifications/message',
						params: {
							level: 'info',
							data: 'Authentication successful',
						},
					})
				} catch (error) {
					clearTimeout(timeout)
					throw error
				}
			}
		},
	)

	registerTool(
		server,
		'logout',
		{
			workshopDirectory: workshopDirectoryInputSchema,
		},
		async ({ workshopDirectory }) => {
			await handleWorkshopDirectory(workshopDirectory)
			await logout()
			await deleteCache()
			return createToolResponse({
				toolName: 'logout',
				summary: 'Logged out and cleared cached credentials.',
				structuredContent: { loggedOut: true },
			})
		},
	)

	registerTool(
		server,
		'set_playground',
		{
			workshopDirectory: workshopDirectoryInputSchema,
			exerciseNumber: z.coerce
				.number()
				.optional()
				.describe(
					'Exercise number to open (1-based). Omit to use the next incomplete step.',
				),
			stepNumber: z.coerce
				.number()
				.optional()
				.describe(
					'Step number to open within the exercise (1-based). Omit to keep the current step or advance.',
				),
			type: z
				.enum(['problem', 'solution'])
				.optional()
				.describe(
					'Step type to open ("problem" or "solution"). Omit to keep the current type or default to problem.',
				),
		},
		async ({ workshopDirectory, exerciseNumber, stepNumber, type }) => {
			await handleWorkshopDirectory(workshopDirectory)
			const authInfo = await getAuthInfo()

			if (!exerciseNumber) {
				if (authInfo) {
					const progress = await getProgress()
					const scoreProgress = (a: (typeof progress)[number]) => {
						if (a.type === 'workshop-instructions') return 0
						if (a.type === 'workshop-finished') return 10000
						if (a.type === 'instructions') return a.exerciseNumber * 100
						if (a.type === 'step') return a.exerciseNumber * 100 + a.stepNumber
						if (a.type === 'finished') return a.exerciseNumber * 100 + 100

						if (a.type === 'unknown') return 100000
						return -1
					}
					const sortedProgress = progress.sort((a, b) => {
						return scoreProgress(a) - scoreProgress(b)
					})
					const nextProgress = sortedProgress.find((p) => !p.epicCompletedAt)
					if (nextProgress) {
						if (nextProgress.type === 'step') {
							const exerciseApp = await getExerciseApp({
								exerciseNumber: nextProgress.exerciseNumber.toString(),
								stepNumber: nextProgress.stepNumber.toString(),
								type: 'problem',
							})
							invariant(exerciseApp, 'No exercise app found')
							await setPlayground(exerciseApp.fullPath)
							return createToolResponse({
								toolName: 'set_playground',
								summary: `Playground set to ${exerciseApp.exerciseNumber}.${exerciseApp.stepNumber}.${exerciseApp.type}.`,
								structuredContent: {
									playground: {
										exerciseNumber: exerciseApp.exerciseNumber,
										stepNumber: exerciseApp.stepNumber,
										type: exerciseApp.type,
										appName: exerciseApp.name,
										fullPath: exerciseApp.fullPath,
									},
								},
							})
						}

						if (
							nextProgress.type === 'instructions' ||
							nextProgress.type === 'finished'
						) {
							throw new Error(
								`The user needs to mark the ${nextProgress.exerciseNumber} ${nextProgress.type === 'instructions' ? 'instructions' : 'finished'} as complete before they can continue. Have them watch the video at ${nextProgress.epicLessonUrl}, then mark it as complete.`,
							)
						}
						if (
							nextProgress.type === 'workshop-instructions' ||
							nextProgress.type === 'workshop-finished'
						) {
							throw new Error(
								`The user needs to mark the ${nextProgress.exerciseNumber} ${nextProgress.type === 'workshop-instructions' ? 'Workshop instructions' : 'Workshop finished'} as complete before they can continue. Have them watch the video at ${nextProgress.epicLessonUrl}, then mark it as complete.`,
							)
						}

						throw new Error(
							`The user needs to mark ${nextProgress.epicLessonSlug} as complete before they can continue. Have them watch the video at ${nextProgress.epicLessonUrl}, then mark it as complete.`,
						)
					}
				}
			}

			const apps = await getApps()
			const exerciseStepApps = apps.filter(isExerciseStepApp)

			const playgroundAppName = await getPlaygroundAppName()
			const currentExerciseStepAppIndex = exerciseStepApps.findIndex(
				(a) => a.name === playgroundAppName,
			)

			let desiredApp: ExerciseStepApp | undefined
			// if nothing was provided, set to the next step problem app
			const noArgumentsProvided = !exerciseNumber && !stepNumber && !type
			if (noArgumentsProvided) {
				desiredApp = exerciseStepApps
					.slice(currentExerciseStepAppIndex + 1)
					.find(isProblemApp)
				invariant(desiredApp, 'No next problem app found to set playground to')
			} else {
				const currentExerciseStepApp =
					exerciseStepApps[currentExerciseStepAppIndex]

				// otherwise, default to the current exercise step app for arguments
				exerciseNumber ??= currentExerciseStepApp?.exerciseNumber
				stepNumber ??= currentExerciseStepApp?.stepNumber
				type ??= currentExerciseStepApp?.type

				desiredApp = exerciseStepApps.find(
					(a) =>
						a.exerciseNumber === exerciseNumber &&
						a.stepNumber === stepNumber &&
						a.type === type,
				)
			}

			invariant(
				desiredApp,
				`No app found for values derived by the arguments: ${exerciseNumber}.${stepNumber}.${type}`,
			)
			await setPlayground(desiredApp.fullPath)
			return createToolResponse({
				toolName: 'set_playground',
				summary: `Playground set to ${desiredApp.name}.`,
				structuredContent: {
					playground: {
						exerciseNumber: desiredApp.exerciseNumber,
						stepNumber: desiredApp.stepNumber,
						type: desiredApp.type,
						appName: desiredApp.name,
						fullPath: desiredApp.fullPath,
					},
				},
			})
		},
	)

	registerTool(
		server,
		'list_saved_playgrounds',
		{
			workshopDirectory: workshopDirectoryInputSchema,
		},
		async ({ workshopDirectory }) => {
			await handleWorkshopDirectory(workshopDirectory)
			const persistEnabled =
				(await getPreferences())?.playground?.persist ?? false
			invariant(
				persistEnabled,
				'Playground persistence is disabled. Enable it in Preferences to use saved playgrounds.',
			)

			const [savedPlaygrounds, apps] = await Promise.all([
				getSavedPlaygrounds(),
				getApps(),
			])
			const savedPlaygroundEntries = savedPlaygrounds.map((entry) => {
				const matchingApp = apps.find((app) => app.name === entry.appName)
				const displayName = matchingApp
					? getAppDisplayName(matchingApp, apps)
					: entry.appName
				return { ...entry, displayName }
			})
			const details = savedPlaygroundEntries.slice(0, 5).map((entry) => {
				const timestamp = formatSavedPlaygroundTimestamp(entry.createdAt)
				return `${entry.displayName} (${entry.appName}) — ${timestamp} — ${entry.id}`
			})
			const summary = savedPlaygroundEntries.length
				? `${savedPlaygroundEntries.length} saved playgrounds found.`
				: 'No saved playgrounds found.'
			return createToolResponse({
				toolName: 'list_saved_playgrounds',
				summary,
				details: details.length ? details : undefined,
				structuredContent: {
					savedPlaygrounds: savedPlaygroundEntries,
				},
			})
		},
	)

	registerTool(
		server,
		'set_saved_playground',
		{
			workshopDirectory: workshopDirectoryInputSchema,
			savedPlaygroundId: z
				.string()
				.optional()
				.describe('Saved playground id to restore (directory name).'),
			latest: z
				.boolean()
				.optional()
				.default(false)
				.describe('Use the most recent saved playground when true.'),
		},
		async ({ workshopDirectory, savedPlaygroundId, latest }) => {
			await handleWorkshopDirectory(workshopDirectory)
			const persistEnabled =
				(await getPreferences())?.playground?.persist ?? false
			invariant(
				persistEnabled,
				'Playground persistence is disabled. Enable it in Preferences to use saved playgrounds.',
			)

			const [savedPlaygrounds, apps] = await Promise.all([
				getSavedPlaygrounds(),
				getApps(),
			])
			invariant(savedPlaygrounds.length, 'No saved playgrounds found.')

			const useLatest = latest || !savedPlaygroundId
			const selected = savedPlaygroundId
				? savedPlaygrounds.find((entry) => entry.id === savedPlaygroundId)
				: useLatest
					? savedPlaygrounds[0]
					: undefined
			invariant(selected, `Saved playground not found: ${savedPlaygroundId}`)

			await setPlayground(selected.fullPath)
			const matchingApp = apps.find((app) => app.name === selected.appName)
			const displayName = matchingApp
				? getAppDisplayName(matchingApp, apps)
				: selected.appName

			return createToolResponse({
				toolName: 'set_saved_playground',
				summary: `Playground set from saved copy: ${displayName}.`,
				structuredContent: {
					savedPlayground: {
						...selected,
						displayName,
					},
				},
			})
		},
	)

	registerTool(
		server,
		'update_progress',
		{
			workshopDirectory: workshopDirectoryInputSchema,
			epicLessonSlug: z
				.string()
				.describe(
					'Lesson slug to update (from `get_exercise_context`, `get_workshop_context`, or `get_what_is_next`).',
				),
			complete: z
				.boolean()
				.optional()
				.default(true)
				.describe('Mark complete or incomplete (default: true).'),
		},
		async ({ workshopDirectory, epicLessonSlug, complete }) => {
			await handleWorkshopDirectory(workshopDirectory)
			await updateProgress({ lessonSlug: epicLessonSlug, complete })
			return createToolResponse({
				toolName: 'update_progress',
				summary: `Lesson "${epicLessonSlug}" marked as ${complete ? 'complete' : 'incomplete'}.`,
				structuredContent: { epicLessonSlug, complete },
			})
		},
	)

	// TODO: add a tool to run the dev/test script for the given app
}

// These are tools that retrieve resources. Not all resources should be
// accessible via tools, but allowing the LLM to access them on demand is useful
// for some situations.
export function initResourceTools(server: McpServer) {
	registerTool(
		server,
		'get_workshop_context',
		workshopContextResource.inputSchema,
		async ({ workshopDirectory }) => {
			workshopDirectory = await handleWorkshopDirectory(workshopDirectory)
			const resource = await workshopContextResource.getResource({
				workshopDirectory,
			})
			const structured = createResourceStructuredContent(resource)
			const data = structured.data as { exercises?: Array<unknown> } | null
			const exerciseCount = Array.isArray(data?.exercises)
				? data.exercises.length
				: 0
			return createToolResponse({
				toolName: 'get_workshop_context',
				summary: 'Workshop context retrieved.',
				details: exerciseCount ? [`Exercises: ${exerciseCount}`] : undefined,
				content: [getEmbeddedResourceContent(resource)],
				structuredContent: {
					workshopContext: structured,
				},
			})
		},
	)

	registerTool(
		server,
		'get_exercise_context',
		exerciseContextResource.inputSchema,
		async ({ workshopDirectory, exerciseNumber }) => {
			workshopDirectory = await handleWorkshopDirectory(workshopDirectory)
			const resource = await exerciseContextResource.getResource({
				workshopDirectory,
				exerciseNumber,
			})
			const structured = createResourceStructuredContent(resource)
			const data = structured.data as {
				steps?: Array<unknown>
				exerciseInfo?: { number?: number }
			} | null
			const stepCount = Array.isArray(data?.steps) ? data.steps.length : 0
			const number = data?.exerciseInfo?.number
			return createToolResponse({
				toolName: 'get_exercise_context',
				summary: number
					? `Exercise ${number} context retrieved.`
					: 'Exercise context retrieved.',
				details: stepCount ? [`Steps: ${stepCount}`] : undefined,
				content: [getEmbeddedResourceContent(resource)],
				structuredContent: {
					exerciseContext: structured,
				},
			})
		},
	)

	registerTool(
		server,
		'get_diff_between_apps',
		diffBetweenAppsResource.inputSchema,
		async ({ workshopDirectory, app1, app2 }) => {
			workshopDirectory = await handleWorkshopDirectory(workshopDirectory)
			const resource = await diffBetweenAppsResource.getResource({
				workshopDirectory,
				app1,
				app2,
			})
			const diff = parseResourceText(resource)
			const diffText =
				typeof diff === 'string' ? diff : JSON.stringify(diff ?? '')
			return createToolResponse({
				toolName: 'get_diff_between_apps',
				summary: `Diff generated for ${app1} vs ${app2}.`,
				details: diffText
					? [`Diff length: ${diffText.length} chars`]
					: undefined,
				content: [getEmbeddedResourceContent(resource)],
				structuredContent: {
					app1,
					app2,
					diff,
				},
			})
		},
	)

	registerTool(
		server,
		'get_exercise_step_progress_diff',
		exerciseStepProgressDiffResource.inputSchema,
		async ({ workshopDirectory }) => {
			workshopDirectory = await handleWorkshopDirectory(workshopDirectory)
			const resource = await exerciseStepProgressDiffResource.getResource({
				workshopDirectory,
			})
			const diff = parseResourceText(resource)
			const diffText =
				typeof diff === 'string' ? diff : JSON.stringify(diff ?? '')
			return createToolResponse({
				toolName: 'get_exercise_step_progress_diff',
				summary: 'Progress diff generated for the current step.',
				details: diffText
					? [`Diff length: ${diffText.length} chars`]
					: undefined,
				content: [
					createText(getDiffInstructionText()),
					getEmbeddedResourceContent(resource),
				],
				structuredContent: {
					diff,
				},
			})
		},
	)

	registerTool(
		server,
		'get_exercise_step_context',
		exerciseStepContextResource.inputSchema,
		async ({ workshopDirectory, exerciseNumber, stepNumber }) => {
			workshopDirectory = await handleWorkshopDirectory(workshopDirectory)
			const resource = await exerciseStepContextResource.getResource({
				workshopDirectory,
				exerciseNumber,
				stepNumber,
			})
			const structured = createResourceStructuredContent(resource)
			const data = structured.data as {
				stepInfo?: { number?: number }
				exerciseInfo?: { number?: number }
			} | null
			const step = data?.stepInfo?.number
			const exercise = data?.exerciseInfo?.number
			return createToolResponse({
				toolName: 'get_exercise_step_context',
				summary:
					exercise && step
						? `Exercise ${exercise} step ${step} context retrieved.`
						: 'Exercise step context retrieved.',
				content: [getEmbeddedResourceContent(resource)],
				structuredContent: {
					exerciseStepContext: structured,
				},
			})
		},
	)

	registerTool(
		server,
		'view_video',
		{
			videoUrl: z
				.string()
				.describe('Video URL from exercise context or `get_what_is_next`.'),
		},
		async ({ videoUrl }) => {
			const url: URL = new URL('mcp-ui/epic-video', 'http://localhost:5639')
			url.searchParams.set('url', videoUrl)
			return createToolResponse({
				toolName: 'view_video',
				summary: 'Video ready in the embedded player.',
				content: [
					createUIResource({
						content: {
							type: 'externalUrl',
							iframeUrl: url.toString(),
						},
						uri: `ui://epicshop/epic-video/${videoUrl.toString()}`,
						encoding: 'text',
					}),
				],
				structuredContent: {
					videoUrl,
					iframeUrl: url.toString(),
				},
			})
		},
	)

	registerTool(
		server,
		'open_exercise_step_files',
		{
			workshopDirectory: workshopDirectoryInputSchema,
		},
		async ({ workshopDirectory }) => {
			await handleWorkshopDirectory(workshopDirectory)
			const playgroundApp = await getPlaygroundApp()
			invariant(
				playgroundApp,
				'The playground app is not currently set. Use the `set_playground` tool to set the playground to an exercise step.',
			)
			const problemApp = await getAppByName(playgroundApp.appName)
			invariant(
				problemApp,
				'Cannot find the problem app for the playground app. This is unexpected. The playground app may need to be reset using the `set_playground` tool.',
			)
			invariant(
				isProblemApp(problemApp) && problemApp.solutionName,
				'The playground app is not set to a problem app with a solution. The playground app may need to be reset using the `set_playground` tool.',
			)
			const solutionApp = await getAppByName(problemApp.solutionName)
			invariant(
				solutionApp,
				'Cannot find the solution app for the problem app. Cannot open the files for a step that does not have both a problem and solution.',
			)
			const diffFiles = await getDiffFiles(problemApp, solutionApp)
			invariant(
				diffFiles,
				'There was a problem generating the diff. Check the terminal output.',
			)
			for (const file of diffFiles) {
				const fullPath = path.join(playgroundApp.fullPath, file.path)
				await launchEditor(fullPath, file.line)
			}
			const openedFiles = diffFiles.map((file) => ({
				path: file.path,
				line: file.line,
			}))
			return createToolResponse({
				toolName: 'open_exercise_step_files',
				summary: `Opened ${diffFiles.length} file${diffFiles.length === 1 ? '' : 's'}.`,
				details: openedFiles.map((file) => `- ${file.path}:${file.line}`),
				structuredContent: {
					count: openedFiles.length,
					files: openedFiles,
				},
			})
		},
	)

	registerTool(
		server,
		'get_user_info',
		userInfoResource.inputSchema,
		async ({ workshopDirectory }) => {
			workshopDirectory = await handleWorkshopDirectory(workshopDirectory)
			const resource = await userInfoResource.getResource({ workshopDirectory })
			const userInfoRaw = parseResourceText(resource)
			const userInfo =
				userInfoRaw && typeof userInfoRaw === 'object'
					? (userInfoRaw as { email?: string; id?: string; name?: string })
					: null
			const summary = userInfo
				? `User info retrieved for ${userInfo.email ?? 'unknown email'}.`
				: 'No authenticated user found.'
			return createToolResponse({
				toolName: 'get_user_info',
				summary,
				statusEmoji: userInfo ? '✅' : '⚠️',
				content: [getEmbeddedResourceContent(resource)],
				structuredContent: {
					userInfo,
				},
			})
		},
	)

	registerTool(
		server,
		'get_user_access',
		userAccessResource.inputSchema,
		async ({ workshopDirectory }) => {
			workshopDirectory = await handleWorkshopDirectory(workshopDirectory)
			const resource = await userAccessResource.getResource({
				workshopDirectory,
			})
			const access = parseResourceText(resource) as {
				userHasAccess?: boolean
			} | null
			const userHasAccess =
				typeof access?.userHasAccess === 'boolean'
					? access.userHasAccess
					: undefined
			const statusEmoji = userHasAccess === false ? '⚠️' : '✅'
			return createToolResponse({
				toolName: 'get_user_access',
				summary:
					typeof userHasAccess === 'boolean'
						? `User access: ${userHasAccess ? 'paid' : 'free'}`
						: 'User access retrieved.',
				statusEmoji,
				content: [getEmbeddedResourceContent(resource)],
				structuredContent: {
					userHasAccess,
				},
			})
		},
	)

	registerTool(
		server,
		'get_user_progress',
		userProgressResource.inputSchema,
		async ({ workshopDirectory }) => {
			workshopDirectory = await handleWorkshopDirectory(workshopDirectory)
			const resource = await userProgressResource.getResource({
				workshopDirectory,
			})
			const progress = parseResourceText(resource)
			const items: Array<{ epicCompletedAt?: unknown }> = Array.isArray(
				progress,
			)
				? (progress as Array<{ epicCompletedAt?: unknown }>)
				: []
			const incompleteCount = items.filter(
				(item) => !item.epicCompletedAt,
			).length
			return createToolResponse({
				toolName: 'get_user_progress',
				summary: `Progress retrieved. Incomplete items: ${incompleteCount}.`,
				content: [getEmbeddedResourceContent(resource)],
				structuredContent: {
					progress: items,
					incompleteCount,
				},
			})
		},
	)
}

// Sometimes the user will ask the LLM to select a prompt to use so they don't have to.
export function initPromptTools(server: McpServer) {
	registerTool(
		server,
		'get_quiz_instructions',
		quizMeInputSchema,
		async ({ workshopDirectory, exerciseNumber }) => {
			workshopDirectory = await handleWorkshopDirectory(workshopDirectory)
			const result = await quizMe({ workshopDirectory, exerciseNumber })
			const promptContent = result.messages.map((m) => {
				if (m.content.type === 'resource') {
					return getEmbeddedResourceContent(m.content.resource)
				}
				return m.content
			})
			return createToolResponse({
				toolName: 'get_quiz_instructions',
				summary: 'Quiz instructions prepared.',
				details: [
					exerciseNumber
						? `Exercise: ${exerciseNumber}`
						: 'Exercise: random selection',
				],
				content: promptContent,
				structuredContent: {
					exerciseNumber: exerciseNumber ?? null,
					messages: result.messages,
				},
			})
		},
	)

	registerTool(
		server,
		'get_what_is_next',
		{
			workshopDirectory: workshopDirectoryInputSchema,
		},
		async ({ workshopDirectory }) => {
			await handleWorkshopDirectory(workshopDirectory)

			const authInfo = await getAuthInfo()
			if (!authInfo) {
				return createToolResponse({
					toolName: 'get_what_is_next',
					summary: 'User is not logged in.',
					statusEmoji: '⚠️',
					details: ['Use `login` to authenticate the user.'],
					nextSteps: ['Call `login` to start device authorization.'],
					includeMetaNextSteps: false,
					structuredContent: {
						status: 'not_authenticated',
					},
				})
			}
			const progress = await getProgress()

			const scoreProgress = (a: (typeof progress)[number]) => {
				if (a.type === 'workshop-instructions') return 0
				if (a.type === 'workshop-finished') return 10000
				if (a.type === 'instructions') return a.exerciseNumber * 100
				if (a.type === 'step') return a.exerciseNumber * 100 + a.stepNumber
				if (a.type === 'finished') return a.exerciseNumber * 100 + 100

				if (a.type === 'unknown') return 100000
				return -1
			}
			const sortedProgress = progress.sort((a, b) => {
				return scoreProgress(a) - scoreProgress(b)
			})
			const nextProgress = sortedProgress.find((p) => !p.epicCompletedAt)
			if (!nextProgress) {
				return createToolResponse({
					toolName: 'get_what_is_next',
					summary: 'Workshop complete.',
					details: ['Invite the user to request a quiz on the material.'],
					includeMetaNextSteps: false,
					content: [createText(await createWorkshopSummary())],
					structuredContent: {
						status: 'complete',
					},
				})
			}

			invariant(
				nextProgress.type !== 'unknown',
				`Next progress type is unknown. This is unexpected. Sorry, we don't know what to do here. Here's a summary of the workshop:\n\n${await createWorkshopSummary()}`,
			)

			if (nextProgress.type === 'workshop-instructions') {
				const embedUrl = new URL('mcp-ui/epic-video', 'http://localhost:5639')
				embedUrl.searchParams.set('url', nextProgress.epicLessonUrl)
				return createToolResponse({
					toolName: 'get_what_is_next',
					summary: 'User should complete workshop instructions.',
					includeMetaNextSteps: false,
					content: [
						createText(
							`The user has just begun! They need to watch the workshop instructions video and read the instructions to get started. When they say they're done or ready for what's next, mark it as complete using the \`update_progress\` tool with the slug "${nextProgress.epicLessonSlug}" and then call \`get_what_is_next\` again to get the next step. Relevant info is below:`,
						),
						createText(await createWorkshopSummary()),
						createText(
							`Instructions:\n${await readInWorkshop('exercises', 'README.mdx')}`,
						),
						createUIResource({
							uri: `ui://epicshop/epic-video/${nextProgress.epicLessonUrl}`,
							encoding: 'text',
							content: {
								type: 'externalUrl',
								iframeUrl: embedUrl.toString(),
							},
						}),
					],
					structuredContent: {
						nextStep: {
							type: nextProgress.type,
							epicLessonSlug: nextProgress.epicLessonSlug,
							epicLessonUrl: nextProgress.epicLessonUrl,
						},
					},
				})
			}

			if (nextProgress.type === 'workshop-finished') {
				const embedUrl = new URL('mcp-ui/epic-video', 'http://localhost:5639')
				embedUrl.searchParams.set('url', nextProgress.epicLessonUrl)
				return createToolResponse({
					toolName: 'get_what_is_next',
					summary: 'User should complete workshop finished instructions.',
					includeMetaNextSteps: false,
					content: [
						createText(
							`The user has almost completed the workshop. They just need to watch the workshop finished video and read the finished instructions to get started. When they say they're done or ready for what's next, mark it as complete using the \`update_progress\` tool with the slug "${nextProgress.epicLessonSlug}" and then call \`get_what_is_next\` again to get the next step. Relevant info is below:`,
						),
						createText(
							`Finished instructions:\n${await readInWorkshop('exercises', 'FINISHED.mdx')}`,
						),
						createUIResource({
							uri: `ui://epicshop/epic-video/${nextProgress.epicLessonUrl}`,
							encoding: 'text',
							content: {
								type: 'externalUrl',
								iframeUrl: embedUrl.toString(),
							},
						}),
					],
					structuredContent: {
						nextStep: {
							type: nextProgress.type,
							epicLessonSlug: nextProgress.epicLessonSlug,
							epicLessonUrl: nextProgress.epicLessonUrl,
						},
					},
				})
			}

			const ex = nextProgress.exerciseNumber.toString().padStart(2, '0')
			if (nextProgress.type === 'instructions') {
				const embedUrl = new URL('mcp-ui/epic-video', 'http://localhost:5639')
				embedUrl.searchParams.set('url', nextProgress.epicLessonUrl)
				const exercise = await getExercise(nextProgress.exerciseNumber)
				return createToolResponse({
					toolName: 'get_what_is_next',
					summary: `User should complete exercise ${ex} intro.`,
					includeMetaNextSteps: false,
					content: [
						createText(
							`The user needs to complete the intro for exercise ${ex}. When they say they're done or ready for what's next, mark it as complete using the \`update_progress\` tool with the slug "${nextProgress.epicLessonSlug}" and then call \`get_what_is_next\` again to get the next step. Relevant info is below:`,
						),
						createText(
							`Exercise instructions:\n${await readReadme(exercise?.fullPath)}`,
						),
						createUIResource({
							uri: `ui://epicshop/epic-video/${nextProgress.epicLessonUrl}`,
							encoding: 'text',
							content: {
								type: 'externalUrl',
								iframeUrl: embedUrl.toString(),
							},
						}),
					],
					structuredContent: {
						nextStep: {
							type: nextProgress.type,
							exerciseNumber: nextProgress.exerciseNumber,
							epicLessonSlug: nextProgress.epicLessonSlug,
							epicLessonUrl: nextProgress.epicLessonUrl,
						},
					},
				})
			}
			if (nextProgress.type === 'finished') {
				const embedUrl = new URL('mcp-ui/epic-video', 'http://localhost:5639')
				embedUrl.searchParams.set('url', nextProgress.epicLessonUrl)
				const exercise = await getExercise(nextProgress.exerciseNumber)
				return createToolResponse({
					toolName: 'get_what_is_next',
					summary: `User should complete exercise ${ex} outro.`,
					includeMetaNextSteps: false,
					content: [
						createText(
							`The user is almost finished with exercise ${ex}. They need to complete the outro for exercise ${ex}. Relevant info is below:`,
						),
						createText(
							`Exercise finished instructions:\n${await readReadme(exercise?.fullPath)}`,
						),
						createUIResource({
							uri: `ui://epicshop/epic-video/${nextProgress.epicLessonUrl}`,
							encoding: 'text',
							content: {
								type: 'externalUrl',
								iframeUrl: embedUrl.toString(),
							},
						}),
					],
					structuredContent: {
						nextStep: {
							type: nextProgress.type,
							exerciseNumber: nextProgress.exerciseNumber,
							epicLessonSlug: nextProgress.epicLessonSlug,
							epicLessonUrl: nextProgress.epicLessonUrl,
						},
					},
				})
			}

			const st = nextProgress.stepNumber.toString().padStart(2, '0')
			if (nextProgress.type === 'step') {
				const exercise = await getExercise(nextProgress.exerciseNumber)
				const problemEmbedUrl = new URL(
					'mcp-ui/epic-video',
					'http://localhost:5639',
				)
				problemEmbedUrl.searchParams.set('url', nextProgress.epicLessonUrl)
				const solutionEmbedUrl = new URL(
					'mcp-ui/epic-video',
					'http://localhost:5639',
				)
				solutionEmbedUrl.searchParams.set(
					'url',
					`${nextProgress.epicLessonUrl}/solution`,
				)
				const step = exercise?.steps.find(
					(s) => s.stepNumber === nextProgress.stepNumber,
				)
				invariant(
					step,
					`No step found for exercise ${nextProgress.exerciseNumber} step ${nextProgress.stepNumber}`,
				)
				return createToolResponse({
					toolName: 'get_what_is_next',
					summary: `User is on step ${st} of exercise ${ex}.`,
					includeMetaNextSteps: false,
					content: [
						createText(
							`
The user is on step ${st} of exercise ${ex}. To complete this step they need to:
1. Watch the problem video
2. Review the problem instructions (you can summarize these from the info below)
3. Set the playground to the problem app (you can help them using the \`set_playground\` tool)
4. Open the relevant files in their playground environment (you can help them using the \`open_exercise_step_files\` tool)
5. Run the tests and dev server to validate their work (no tools for this are available yet, but you can use the \`get_exercise_step_progress_diff\` tool to help them understand what work they still need to do as they go)
6. Watch the solution video
7. Review the solution instructions (you can summarize these from the info below)
8. Mark the step as complete (you can help them using the \`update_progress\` tool with the slug "${nextProgress.epicLessonSlug}")

Then you can call \`get_what_is_next\` again to get the next step.
							`.trim(),
						),
						createText(
							`Exercise step problem instructions:\n${await readReadme(step.problem?.fullPath)}`,
						),
						createText(
							`Exercise step solution instructions:\n${await readReadme(step.solution?.fullPath)}`,
						),
						createUIResource({
							uri: `ui://epicshop/epic-video/${nextProgress.epicLessonUrl}`,
							encoding: 'text',
							content: {
								type: 'externalUrl',
								iframeUrl: problemEmbedUrl.toString(),
							},
						}),
						createUIResource({
							uri: `ui://epicshop/epic-video/${nextProgress.epicLessonUrl}/solution`,
							encoding: 'text',
							content: {
								type: 'externalUrl',
								iframeUrl: solutionEmbedUrl.toString(),
							},
						}),
					],
					structuredContent: {
						nextStep: {
							type: nextProgress.type,
							exerciseNumber: nextProgress.exerciseNumber,
							stepNumber: nextProgress.stepNumber,
							epicLessonSlug: nextProgress.epicLessonSlug,
							videoUrls: {
								problem: nextProgress.epicLessonUrl,
								solution: `${nextProgress.epicLessonUrl}/solution`,
							},
						},
					},
				})
			}
			throw new Error(
				`This is unexpected, but I do not know what the next step for the user is. Sorry!`,
			)
		},
	)
}

function getEmbeddedResourceContent(
	resource: ReadResourceResult['contents'][number],
) {
	if (clientSupportsEmbeddedResources) {
		return {
			type: 'resource' as const,
			resource,
		}
	} else if ('text' in resource && typeof resource.text === 'string') {
		return {
			type: 'text' as const,
			text: resource.text,
		}
	} else if ('blob' in resource) {
		return {
			type: 'text' as const,
			text: `Binary resource ${resource.uri} (${resource.mimeType ?? 'unknown'})`,
		}
	} else {
		throw new Error(`Unknown resource content for ${resource.uri}`)
	}
}

function createText(text: unknown): CallToolResult['content'][number] {
	if (typeof text === 'string') {
		return { type: 'text', text }
	} else {
		return { type: 'text', text: JSON.stringify(text) }
	}
}

async function createWorkshopSummary() {
	const config = getWorkshopConfig()
	const exercises = await getExercises()
	let summary = `# ${config.title}

${config.subtitle}

## Exercises
`
	for (const exercise of exercises) {
		summary += `
${exercise.exerciseNumber.toString().padStart(2, '0')}. ${exercise.title}
${exercise.steps.map((s) => `  ${s.stepNumber.toString().padStart(2, '0')}. ${s.problem?.title ?? s.solution?.title ?? 'No title'}`).join('\n')}`
	}
	return summary
}

async function readReadme(dirPath?: string) {
	return (
		(dirPath ? await safeReadFile(path.join(dirPath, 'README.mdx')) : null) ??
		'No instructions'
	)
}

function getDiffInstructionText() {
	return `
Below is the diff between the user's work in progress and the solution.
Lines starting with \`-\` show code that needs to be removed from the user's solution.
Lines starting with \`+\` show code that needs to be added to the user's solution.

If there are significant differences, the user's work is incomplete.

Here's an example of the output you can expect:

--------

diff --git ./example.ts ./example.ts
index e05035d..a70eb4b 100644
--- ./example.ts
+++ ./example.ts
@@ -236,14 +236,27 @@ export async function sayHello(name?: string) {
+	if (name) {
+		return \`Hello, \${name}!\`
+	}
-	await new Promise((resolve) => setTimeout(resolve, 1000))
 	return 'Hello, World!'
 }

--------

In this example, you should tell the user they still need to:
- add the if statement to return the name if it's provided
- remove the await promise that resolves after 1 second

For additional context, you can use the \`get_exercise_instructions\` tool
to get the instructions for the current exercise step to help explain the
significance of changes.
	`.trim()
}
