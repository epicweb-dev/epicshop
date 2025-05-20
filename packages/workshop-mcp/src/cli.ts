#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import { invariant } from '@epic-web/invariant'
import {
	getApps,
	isPlaygroundApp,
	findSolutionDir,
	getFullPathFromAppName,
	init as initApps,
	extractNumbersAndTypeFromAppNameOrPath,
	getExercise,
	getPlaygroundApp,
	getPlaygroundAppName,
	isProblemApp,
	isExerciseStepApp,
	setPlayground,
	type ExerciseStepApp,
} from '@epic-web/workshop-utils/apps.server'
import { getAuthInfo } from '@epic-web/workshop-utils/db.server'
import {
	getEpicVideoInfos,
	userHasAccessToWorkshop,
} from '@epic-web/workshop-utils/epic-api.server'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'

// Create server instance
const server = new McpServer(
	{
		name: 'epicshop',
		version: '1.0.0',
		capabilities: {
			tools: {},
		},
	},
	{
		instructions: `
This is intended to be used within a workshop using the Epic Workshop App
(@epic-web/workshop-app) to help learners in the process of completing the
workshop exercises and understanding the learning outcomes.

The user's work in progress is in the \`playground\` directory. Any changes they
ask you to make should be in this directory.
		`.trim(),
	},
)

server.tool(
	'get_diff_between_apps',
	`
Intended to give context about the changes between two apps.

The output is a git diff of the playground directory as BASE (their work in
progress) against the solution directory as HEAD (the final state they're trying
to achieve).

The output is formatted as a git diff.

App IDs are formatted as \`{exerciseNumber}.{stepNumber}.{type}\`.

If the user asks for the diff for 2.3, then use 02.03.problem for app1 and 02.03.solution for app2.
	`,
	{
		workshopDirectory: z
			.string()
			.describe(
				'The workshop directory (the root directory of the workshop repo.).',
			),
		app1: z.string().describe('The ID of the first app'),
		app2: z.string().describe('The ID of the second app'),
	},
	async ({ workshopDirectory, app1, app2 }) => {
		try {
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

			if (!diffCode) return replyWithText('No changes')

			return replyWithText(diffCode)
		} catch (error) {
			return replyWithError(error)
		}
	},
)

server.tool(
	'get_exercise_step_progress_diff',
	`
Intended to help a student understand what work they still have to complete.

This returns a git diff of the playground directory as BASE (their work in
progress) against the solution directory as HEAD (the final state they're trying
to achieve). Meaning, if there are lines removed, it means they still need to
add those lines and if they are added, it means they still need to remove them.

If there's a diff with significant changes, you should explain what the changes
are and their significance. Be brief. Let them tell you whether they need you to
elaborate.

The output for this changes over time so it's useful to call multiple times.

For additional context, you can use the \`get_exercise_instructions\` tool
to get the instructions for the current exercise step to help explain the
significance of changes.
	`.trim(),
	{
		workshopDirectory: z
			.string()
			.describe(
				'The workshop directory (the root directory of the workshop repo.).',
			),
	},
	async ({ workshopDirectory }) => {
		try {
			await handleWorkshopDirectory(workshopDirectory)

			const { getDiffOutputWithRelativePaths } = await import(
				'@epic-web/workshop-utils/diff.server'
			)

			const apps = await getApps()
			const playgroundApp = apps.find(isPlaygroundApp)

			if (!playgroundApp) {
				return {
					content: [{ type: 'text', text: 'No playground app found' }],
					isError: true,
				}
			}

			const baseApp = playgroundApp
			const solutionDir = await findSolutionDir({
				fullPath: await getFullPathFromAppName(playgroundApp.appName),
			})
			const headApp = apps.find((a) => a.fullPath === solutionDir)

			if (!headApp) {
				return {
					content: [{ type: 'text', text: 'No playground solution app found' }],
					isError: true,
				}
			}

			const diffCode = await getDiffOutputWithRelativePaths(baseApp, headApp)

			if (!diffCode) return replyWithText('No changes')

			return replyWithText(diffCode)
		} catch (error) {
			return replyWithError(error)
		}
	},
)

server.tool(
	'get_exercise_context',
	`
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
	{
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
	},
	async ({ workshopDirectory, exerciseNumber }) => {
		try {
			await handleWorkshopDirectory(workshopDirectory)
			const userHasAccess = await userHasAccessToWorkshop()
			const authInfo = await getAuthInfo()
			let stepNumber = 1
			const playgroundApp = await getPlaygroundApp()
			invariant(playgroundApp, 'No playground app found')
			const numbers = extractNumbersAndTypeFromAppNameOrPath(
				playgroundApp.appName,
			)
			const isCurrentExercise =
				exerciseNumber === undefined ||
				exerciseNumber === Number(numbers?.exerciseNumber)
			if (exerciseNumber === undefined) {
				invariant(numbers, 'No numbers found in playground app name')
				exerciseNumber = Number(numbers.exerciseNumber)
				stepNumber = Number(numbers.stepNumber)
			}
			const exercise = await getExercise(exerciseNumber)
			invariant(
				exercise,
				`No exercise found for exercise number ${exerciseNumber}`,
			)

			const videoInfos = await getEpicVideoInfos([
				...(exercise.instructionsEpicVideoEmbeds ?? []),
				...exercise.steps.flatMap((s) => s.problem?.epicVideoEmbeds ?? []),
				...exercise.steps.flatMap((s) => s.solution?.epicVideoEmbeds ?? []),
				...(exercise.finishedEpicVideoEmbeds ?? []),
			])

			function getTranscriptsElement(embeds?: Array<string>) {
				if (!embeds) return '<transcripts />'
				if (!userHasAccess && embeds.length) {
					return `
						<transcripts>
							User must upgrade before they can get access to ${embeds.length} transcript${embeds.length === 1 ? '' : 's'}.
						</transcripts>
					`.trim()
				}
				const transcripts = ['<transcripts>']
				for (const embed of embeds) {
					const info = videoInfos[embed]
					if (info) {
						if (info.status === 'error') {
							if (info.type === 'region-restricted') {
								transcripts.push(
									`
									<transcript
										embed="${embed}"
										status="error"
										type="${info.type}"
										requested-country="${info.requestCountry}"
										restricted-country="${info.restrictedCountry}"
									/>
								`.trim(),
								)
							} else {
								transcripts.push(
									`
									<transcript
										embed="${embed}"
										status="error"
										type="${info.type}"
										status-code="${info.statusCode}"
										status-text="${info.statusText}"
									/>
								`.trim(),
								)
							}
						} else {
							transcripts.push(
								`<transcript embed="${embed}" status="success">${info.transcript}</transcript>`,
							)
						}
					} else {
						transcripts.push(
							`<transcript embed="${embed}" status="error" type="not-found">No transcript found</transcript>`,
						)
					}
				}
				transcripts.push('</transcripts>')
				return transcripts.join('\n')
			}

			async function getFileContentElement(filePath: string) {
				return `<file path="${filePath}">${(await safeReadFile(filePath)) ?? 'None found'}</file>`
			}
			let text = `
Below is all the context for this exercise and each step.

<currentContext>
	<user hasAccess="${userHasAccess}" isAuthenticated="${Boolean(authInfo)}" email="${authInfo?.email}" />
	${
		isCurrentExercise
			? `<playground>
		<exerciseNumber>${exerciseNumber}</exerciseNumber>
		<stepNumber>${stepNumber}</stepNumber>
	</playground>`
			: '<playground>currently set to a different exercise</playground>'
	}
</currentContext>

<exerciseBackground number="${exerciseNumber}">
	<intro>
		${await getFileContentElement(path.join(exercise.fullPath, 'README.mdx'))}
		${getTranscriptsElement(exercise.instructionsEpicVideoEmbeds)}
	</intro>
	<outro>
		${await getFileContentElement(path.join(exercise.fullPath, 'FINISHED.mdx'))}
		${getTranscriptsElement(exercise.finishedEpicVideoEmbeds)}
	</outro>
</exerciseBackground>
			`.trim()

			if (exercise.steps) {
				text += '\n\n<steps>'
				for (const app of exercise.steps) {
					text += `
<step number="${app.stepNumber}" isCurrent="${isCurrentExercise && app.stepNumber === stepNumber}">
	<problem>
		${app.problem ? await getFileContentElement(path.join(app.problem?.fullPath, `README.mdx`)) : 'No problem found'}
		${getTranscriptsElement(app.problem?.epicVideoEmbeds ?? [])}
	</problem>
	<solution>
		${app.solution ? await getFileContentElement(path.join(app.solution?.fullPath, `README.mdx`)) : 'No solution found'}
		${getTranscriptsElement(app.solution?.epicVideoEmbeds ?? [])}
	</solution>
</step>`
				}
				text += '</steps>\n\n'

				text += `Reminder, the current step is ${stepNumber} of ${exercise.steps.length + 1}. The most relevant information will be in the context abouve within the current step.`
			} else {
				text += `Unusually, this exercise has no steps.`
			}

			return {
				content: [{ type: 'text', text: text }],
			}
		} catch (error) {
			return replyWithError(error)
		}
	},
)

server.tool(
	'set_playground',
	`
Sets the playground environment so the user can continue to that exercise or see
what that step looks like in their playground environment.

NOTE: this will override their current exercise step work in the playground!

Generally, it is better to not provide an exerciseNumber, stepNumber, and type
and let the user continue to the next exercise. Only provide these arguments if
the user explicitely asks to go to a specific exercise or step. If the user asks
to start an exercise, specify stepNumber 1 and type 'problem' unless otherwise
directed.

Argument examples:
A. Set to next exercise step from current (or first if there is none) - Most common
	- [No arguments]
B. Set to a specific exercise step
	- exerciseNumber: 1
	- stepNumber: 1
	- type: 'solution'
C. Set to the solution of the current exercise step
	- type: 'solution'
D. Set to the second step problem of the current exercise
	- stepNumber: 2
E. Set to the first step problem of the fifth exercise
	- exerciseNumber: 5

An error will be returned if no app is found for the given arguments.
	`.trim(),
	{
		workshopDirectory: z.string().describe('The workshop directory'),
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
	async ({ workshopDirectory, exerciseNumber, stepNumber, type }) => {
		try {
			await handleWorkshopDirectory(workshopDirectory)

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
			return replyWithText(`Playground set to ${desiredApp.name}`)
		} catch (error) {
			return replyWithError(error)
		}
	},
)

// TODO: add preferences tools

async function handleWorkshopDirectory(workshopDirectory: string) {
	if (workshopDirectory.endsWith('playground')) {
		workshopDirectory = path.join(workshopDirectory, '..')
	}

	await initApps(workshopDirectory)
	return workshopDirectory
}

async function safeReadFile(filePath: string) {
	try {
		return await fs.readFile(filePath, 'utf-8')
	} catch {
		return null
	}
}

function replyWithText(text: string): CallToolResult {
	return {
		content: [{ type: 'text', text }],
	}
}

function replyWithError(error: unknown): CallToolResult {
	return {
		content: [{ type: 'text', text: getErrorMessage(error) }],
		isError: true,
	}
}

function getErrorMessage(
	error: unknown,
	defaultMessage: string = 'Unknown Error',
) {
	if (typeof error === 'string') return error
	if (
		error &&
		typeof error === 'object' &&
		'message' in error &&
		typeof error.message === 'string'
	) {
		return error.message
	}
	return defaultMessage
}

async function main() {
	const transport = new StdioServerTransport()
	await server.connect(transport)
	console.error('epicshop MCP Server running on stdio')
}

main().catch((error) => {
	console.error('Fatal error in main():', error)
	process.exit(1)
})
