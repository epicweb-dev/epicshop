import { invariant } from '@epic-web/invariant'
import {
	getApps,
	getPlaygroundAppName,
	isExerciseStepApp,
	isProblemApp,
	setPlayground,
	type ExerciseStepApp,
} from '@epic-web/workshop-utils/apps.server'
import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { type ReadResourceResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { quizMe, quizMeInputSchema } from './prompts.js'
import {
	exerciseContextResource,
	workshopContextResource,
	diffBetweenAppsResource,
	exerciseStepProgressDiffResource,
} from './resources.js'
import { handleWorkshopDirectory } from './utils.js'

// not enough support for this yet
const clientSupportsEmbeddedResources = false

export function initTools(server: McpServer) {
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
			return {
				content: [
					{
						type: 'text',
						text: `Playground set to ${desiredApp.name}`,
					},
				],
			}
		},
	)
}

// These are tools that retrieve resources. Not all resources should be
// accessible via tools, but allowing the LLM to access them on demand is useful
// for some situations.
export function initResourceTools(server: McpServer) {
	server.tool(
		'get_workshop_context',
		`
Indended to help you get wholistic context of the topics covered in this
workshop. This doesn't go into as much detail per exercise as the
\`get_exercise_context\` tool, but it is a good starting point to orient
yourself on the workshop as a whole.
		`.trim(),
		workshopContextResource.inputSchema,
		async ({ workshopDirectory }) => {
			const resource = await workshopContextResource.getResource({
				workshopDirectory,
			})
			return {
				content: [getEmbeddedResourceContent(resource)],
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
		exerciseContextResource.inputSchema,
		async ({ workshopDirectory, exerciseNumber }) => {
			const resource = await exerciseContextResource.getResource({
				workshopDirectory,
				exerciseNumber,
			})
			return {
				content: [getEmbeddedResourceContent(resource)],
			}
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
		diffBetweenAppsResource.inputSchema,
		async ({ workshopDirectory, app1, app2 }) => {
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

	server.tool(
		'get_exercise_step_progress_diff',
		`
Intended to help a student understand what work they still have to complete.

This returns a git diff of the playground directory as BASE (their work in
progress) against the solution directory as HEAD (the final state they're trying
to achieve). Meaning, if there are lines removed, it means they still need to
add those lines and if they are added, it means they still need to remove them.

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
		exerciseStepProgressDiffResource.inputSchema,
		async ({ workshopDirectory }) => {
			const resource = await exerciseStepProgressDiffResource.getResource({
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
	server.tool(
		'get_quiz_instructions',
		`
If the user asks you to quiz them on a topic from the workshop, use this tool to
retrieve the instructions for how to do so.
		`.trim(),
		quizMeInputSchema,
		async ({ workshopDirectory, exerciseNumber }) => {
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
