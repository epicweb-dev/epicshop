import path from 'node:path'
import { invariant } from '@epic-web/invariant'
import {
	getAppByName,
	getApps,
	getExerciseApp,
	getPlaygroundApp,
	getPlaygroundAppName,
	isExerciseStepApp,
	isProblemApp,
	setPlayground,
	type ExerciseStepApp,
} from '@epic-web/workshop-utils/apps.server'
import { deleteCache } from '@epic-web/workshop-utils/cache.server'
import { getWorkshopConfig } from '@epic-web/workshop-utils/config.server'
import {
	getAuthInfo,
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
import { type ReadResourceResult } from '@modelcontextprotocol/sdk/types.js'
import * as client from 'openid-client'
import { z } from 'zod'
import { quizMe, quizMeInputSchema } from './prompts.js'
import {
	diffBetweenAppsResource,
	exerciseContextResource,
	exerciseStepContextResource,
	exerciseStepProgressDiffResource,
	userAccessResource,
	userInfoResource,
	userProgressResource,
	workshopContextResource,
} from './resources.js'
import {
	handleWorkshopDirectory,
	workshopDirectoryInputSchema,
} from './utils.js'

// not enough support for this yet
const clientSupportsEmbeddedResources = false

export function initTools(server: McpServer) {
	server.registerTool(
		'login',
		{
			description:
				`Allow the user to login (or sign up) to the epic workshop.`.trim(),
			inputSchema: {
				workshopDirectory: workshopDirectoryInputSchema,
			},
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

			return {
				content: [
					{
						type: 'text',
						text: `Please go to ${deviceResponse.verification_uri_complete}. Verify the code on the page is "${deviceResponse.user_code}" to login.`,
					},
				],
			}

			async function handleAuthFlow() {
				const UserInfoSchema = z.object({
					id: z.string(),
					email: z.string(),
					name: z.string().nullable().optional(),
				})

				const timeout = setTimeout(() => {
					void server.server
						.notification({
							method: 'notification',
							params: {
								message: 'Device authorization timed out',
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
							method: 'notification',
							params: {
								message: 'No token set',
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
							method: 'notification',
							params: {
								message: `Failed to parse user info: ${userinfoResult.error.message}`,
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
						method: 'notification',
						params: {
							message: 'Authentication successful',
						},
					})
				} catch (error) {
					clearTimeout(timeout)
					throw error
				}
			}
		},
	)

	server.registerTool(
		'logout',
		{
			description: `Allow the user to logout of the workshop (based on the workshop's host) and delete cache data.`,
			inputSchema: {
				workshopDirectory: workshopDirectoryInputSchema,
			},
		},
		async ({ workshopDirectory }) => {
			await handleWorkshopDirectory(workshopDirectory)
			await logout()
			await deleteCache()
			return {
				content: [{ type: 'text', text: 'Logged out' }],
			}
		},
	)

	server.registerTool(
		'set_playground',
		{
			description: `
Sets the playground environment so the user can continue to that exercise or see
what that step looks like in their playground environment.

NOTE: this will override their current exercise step work in the playground!

Generally, it is better to not provide an exerciseNumber, stepNumber, and type
and let the user continue to the next exercise. Only provide these arguments if
the user explicitely asks to go to a specific exercise or step. If the user asks
to start an exercise, specify stepNumber 1 and type 'problem' unless otherwise
directed.

Argument examples:
A. If logged in and there is an incomplete exercise step, set to next incomplete exercise step based on the user's progress - Most common
	- [No arguments]
B. If not logged in or all exercises are complete, set to next exercise step from current (or first if there is none)
	- [No arguments]
C. Set to a specific exercise step
	- exerciseNumber: 1
	- stepNumber: 1
	- type: 'solution'
D. Set to the solution of the current exercise step
	- type: 'solution'
E. Set to the second step problem of the current exercise
	- stepNumber: 2
F. Set to the first step problem of the fifth exercise
	- exerciseNumber: 5

An error will be returned if no app is found for the given arguments.
	`.trim(),
			inputSchema: {
				workshopDirectory: workshopDirectoryInputSchema,
				exerciseNumber: z.coerce
					.number()
					.optional()
					.describe('The exercise number to set the playground to'),
				stepNumber: z.coerce
					.number()
					.optional()
					.describe('The step number to set the playground to'),
				type: z
					.enum(['problem', 'solution'])
					.optional()
					.describe('The type of app to set the playground to'),
			},
		},
		async ({ workshopDirectory, exerciseNumber, stepNumber, type }) => {
			workshopDirectory = await handleWorkshopDirectory(workshopDirectory)
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
							return {
								content: [
									{
										type: 'text',
										text: `Playground set to ${exerciseApp.exerciseNumber}.${exerciseApp.stepNumber}.${exerciseApp.type}`,
									},
								],
							}
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
			const exerciseContext = await exerciseContextResource.getResource({
				workshopDirectory,
				exerciseNumber: desiredApp.exerciseNumber,
			})
			return {
				content: [
					{
						type: 'text',
						text: `Playground set to ${desiredApp.name}.`,
					},
					getEmbeddedResourceContent(exerciseContext),
				],
			}
		},
	)

	server.registerTool(
		'update_progress',
		{
			description: `
Intended to help you mark an Epic lesson as complete or incomplete.

This will mark the Epic lesson as complete or incomplete and update the user's progress (get updated progress with the \`get_user_progress\` tool, the \`get_exercise_context\` tool, or the \`get_workshop_context\` tool).
		`.trim(),
			inputSchema: {
				workshopDirectory: workshopDirectoryInputSchema,
				epicLessonSlug: z
					.string()
					.describe(
						'The slug of the Epic lesson to mark as complete (can be retrieved from the `get_exercise_context` tool or the `get_workshop_context` tool)',
					),
				complete: z
					.boolean()
					.optional()
					.default(true)
					.describe(
						'Whether to mark the lesson as complete or incomplete (defaults to true)',
					),
			},
		},
		async ({ workshopDirectory, epicLessonSlug, complete }) => {
			await handleWorkshopDirectory(workshopDirectory)
			await updateProgress({ lessonSlug: epicLessonSlug, complete })
			return {
				content: [
					{
						type: 'text',
						text: `Lesson with slug ${epicLessonSlug} marked as ${complete ? 'complete' : 'incomplete'}`,
					},
				],
			}
		},
	)

	// TODO: add a tool to run the dev/test script for the given app
}

// These are tools that retrieve resources. Not all resources should be
// accessible via tools, but allowing the LLM to access them on demand is useful
// for some situations.
export function initResourceTools(server: McpServer) {
	server.registerTool(
		'get_workshop_context',
		{
			description: `
Indended to help you get wholistic context of the topics covered in this
workshop. This doesn't go into as much detail per exercise as the
\`get_exercise_context\` tool, but it is a good starting point to orient
yourself on the workshop as a whole.
		`.trim(),
			inputSchema: workshopContextResource.inputSchema,
		},
		async ({ workshopDirectory }) => {
			workshopDirectory = await handleWorkshopDirectory(workshopDirectory)
			const resource = await workshopContextResource.getResource({
				workshopDirectory,
			})
			return {
				content: [getEmbeddedResourceContent(resource)],
			}
		},
	)

	server.registerTool(
		'get_exercise_context',
		{
			description: `
Intended to help a student understand what they need to do for the current
exercise step.

This returns the instructions MDX content for the current exercise and each
exercise step. If the user is has the paid version of the workshop, it will also
include the transcript from each of the videos as well.

The output for this will rarely change, so it's unnecessary to call this tool
more than once.

\`get_exercise_context\` is often best when used with the
\`get_exercise_step_progress_diff\` tool to help a student understand what
work they still need to do and answer any questions about the exercise.
		`.trim(),
			inputSchema: exerciseContextResource.inputSchema,
		},
		async ({ workshopDirectory, exerciseNumber }) => {
			workshopDirectory = await handleWorkshopDirectory(workshopDirectory)
			const resource = await exerciseContextResource.getResource({
				workshopDirectory,
				exerciseNumber,
			})
			return {
				content: [getEmbeddedResourceContent(resource)],
			}
		},
	)

	server.registerTool(
		'get_diff_between_apps',
		{
			description: `
Intended to give context about the changes between two apps.

The output is a git diff of the playground directory as BASE (their work in
progress) against the solution directory as HEAD (the final state they're trying
to achieve).

The output is formatted as a git diff.

App IDs are formatted as \`{exerciseNumber}.{stepNumber}.{type}\`.

If the user asks for the diff for 2.3, then use 02.03.problem for app1 and 02.03.solution for app2.
		`,
			inputSchema: diffBetweenAppsResource.inputSchema,
		},
		async ({ workshopDirectory, app1, app2 }) => {
			workshopDirectory = await handleWorkshopDirectory(workshopDirectory)
			const resource = await diffBetweenAppsResource.getResource({
				workshopDirectory,
				app1,
				app2,
			})
			return {
				content: [getEmbeddedResourceContent(resource)],
			}
		},
	)

	server.registerTool(
		'get_exercise_step_progress_diff',
		{
			description: `
Intended to help a student understand what work they still have to complete.

This is not a typical diff. It's a diff of the user's work in progress against
the solution.

- Lines starting with \`-\` show code that needs to be removed from the user's solution
- Lines starting with \`+\` show code that needs to be added to the user's solution
- If there are differences, the user's work is incomplete

Only tell the user they have more work to do if the diff output affects the
required behavior, API, or user experience. If the differences are only
stylistic or organizational, explain that things look different, but they are
still valid and ready to be tested.

If there's a diff with significant changes, you should explain what the changes
are and their significance. Be brief. Let them tell you whether they need you to
elaborate.

The output for this changes over time so it's useful to call multiple times.

For additional context, you can use the \`get_exercise_instructions\` tool
to get the instructions for the current exercise step to help explain the
significance of changes.
		`.trim(),
			inputSchema: exerciseStepProgressDiffResource.inputSchema,
		},
		async ({ workshopDirectory }) => {
			workshopDirectory = await handleWorkshopDirectory(workshopDirectory)
			const resource = await exerciseStepProgressDiffResource.getResource({
				workshopDirectory,
			})
			return {
				content: [getEmbeddedResourceContent(resource)],
			}
		},
	)

	server.registerTool(
		'get_exercise_step_context',
		{
			description: `
Intended to help a student understand what they need to do for a specific
exercise step.

This returns the instructions MDX content for the specified exercise step's
problem and solution. If the user has the paid version of the workshop, it will also
include the transcript from each of the videos as well.

The output for this will rarely change, so it's unnecessary to call this tool
more than once for the same exercise step.

\`get_exercise_step_context\` is often best when used with the
\`get_exercise_step_progress_diff\` tool to help a student understand what
work they still need to do and answer any questions about the exercise step.
		`.trim(),
			inputSchema: exerciseStepContextResource.inputSchema,
		},
		async ({ workshopDirectory, exerciseNumber, stepNumber }) => {
			workshopDirectory = await handleWorkshopDirectory(workshopDirectory)
			const resource = await exerciseStepContextResource.getResource({
				workshopDirectory,
				exerciseNumber,
				stepNumber,
			})
			return {
				content: [getEmbeddedResourceContent(resource)],
			}
		},
	)

	server.registerTool(
		'view_video',
		{
			description: `
Intended to help a student view a video.
Only call this tool if you support MCP-UI resources.
This returns an MCP-UI resource you can use if you support MCP-UI.
Otherwise, instead of calling this tool, just tell the user to open the video URL directly.
		`.trim(),
			inputSchema: {
				videoUrl: z
					.string()
					.describe(
						'The URL of the video to view. Get this from the `get_exercise_step_context` tool or the `get_exercise_context` tool depending on what you need.',
					),
			},
		},
		async ({ videoUrl }) => {
			let url: URL = new URL('https://epicweb.dev')
			try {
				url = new URL(videoUrl)
			} catch {
				return {
					content: [{ type: 'text', text: `Invalid URL: "${videoUrl}"` }],
					isError: true,
				}
			}
			url.pathname = url.pathname.endsWith('/')
				? `${url.pathname}embed`
				: `${url.pathname}/embed`
			// special case for epicai.pro videos
			if (
				url.host === 'www.epicai.pro' &&
				!url.pathname.startsWith('/workshops/')
			) {
				url.pathname = `/posts/${url.pathname}`
			}

			return {
				content: [
					createUIResource({
						content: {
							type: 'externalUrl',
							iframeUrl: url.toString(),
						},
						uri: `ui://${url.toString()}`,
						encoding: 'text',
					}),
				],
			}
		},
	)

	server.registerTool(
		'open_exercise_step_files',
		{
			title: 'Open Exercise Step Files',
			description: `
Call this to open the files for the exercise step the playground is currently set to.
		`.trim(),
			inputSchema: {
				workshopDirectory: workshopDirectoryInputSchema,
			},
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
			return {
				content: [
					{
						type: 'text',
						text: `Opened ${diffFiles.length} file${diffFiles.length === 1 ? '' : 's'}:\n${diffFiles.map((file) => `${file.path}:${file.line}`).join('\n')}`,
					},
				],
			}
		},
	)

	server.registerTool(
		'get_user_info',
		{
			description: `
Intended to help you get information about the current user.

This includes the user's name, email, etc. It's mostly useful to determine
whether the user is logged in and know who they are.

If the user is not logged in, tell them to log in by running the \`login\` tool.
		`.trim(),
			inputSchema: userInfoResource.inputSchema,
		},
		async ({ workshopDirectory }) => {
			workshopDirectory = await handleWorkshopDirectory(workshopDirectory)
			const resource = await userInfoResource.getResource({ workshopDirectory })
			return {
				content: [getEmbeddedResourceContent(resource)],
			}
		},
	)

	server.registerTool(
		'get_user_access',
		{
			description: `
Will tell you whether the user has access to the paid features of the workshop.

Paid features include:
- Transcripts
- Progress tracking
- Access to videos
- Access to the discord chat
- Test tab support
- Diff tab support

Encourage the user to upgrade if they need access to the paid features.
		`.trim(),
			inputSchema: userAccessResource.inputSchema,
		},
		async ({ workshopDirectory }) => {
			workshopDirectory = await handleWorkshopDirectory(workshopDirectory)
			const resource = await userAccessResource.getResource({
				workshopDirectory,
			})
			return {
				content: [getEmbeddedResourceContent(resource)],
			}
		},
	)

	server.registerTool(
		'get_user_progress',
		{
			description: `
Intended to help you get the progress of the current user. Can often be helpful
to know what the next step that needs to be completed is. Make sure to provide
the user with the URL of relevant incomplete lessons so they can watch them and
then mark them as complete.
		`.trim(),
			inputSchema: userProgressResource.inputSchema,
		},
		async ({ workshopDirectory }) => {
			workshopDirectory = await handleWorkshopDirectory(workshopDirectory)
			const resource = await userProgressResource.getResource({
				workshopDirectory,
			})
			return {
				content: [getEmbeddedResourceContent(resource)],
			}
		},
	)
}

// Sometimes the user will ask the LLM to select a prompt to use so they don't have to.
export function initPromptTools(server: McpServer) {
	server.registerTool(
		'get_quiz_instructions',
		{
			description: `
If the user asks you to quiz them on a topic from the workshop, use this tool to
retrieve the instructions for how to do so.

- If the user asks for a specific exercise, supply that exercise number.
- If they ask for a specific exericse, supply that exercise number.
- If they ask for a topic and you don't know which exercise that topic is in, use \`get_workshop_context\` to get the list of exercises and their topics and then supply the appropriate exercise number.
		`.trim(),
			inputSchema: quizMeInputSchema,
		},
		async ({ workshopDirectory, exerciseNumber }) => {
			workshopDirectory = await handleWorkshopDirectory(workshopDirectory)
			const result = await quizMe({ workshopDirectory, exerciseNumber })
			return {
				// QUESTION: will a prompt ever return messages that have role: 'assistant'?
				// if so, this may be a little confusing for the LLM, but I can't think of a
				// good use case for that so 🤷‍♂️
				content: result.messages.map((m) => {
					if (m.content.type === 'resource') {
						return getEmbeddedResourceContent(m.content.resource)
					}
					return m.content
				}),
			}
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
	} else if (typeof resource.text === 'string') {
		return {
			type: 'text' as const,
			text: resource.text,
		}
	} else {
		throw new Error(
			`Unknown resource type: ${resource.type} for ${resource.uri}`,
		)
	}
}
