import { getExercises } from '@epic-web/workshop-utils/apps.server'
import { getWorkshopConfig } from '@epic-web/workshop-utils/config.server'
import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { type GetPromptResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { exerciseContextResource } from './resources.js'
import { handleWorkshopDirectory } from './utils.js'

export const quizMeInputSchema = {
	workshopDirectory: z.string().describe('The workshop directory'),
	exerciseNumber: z
		.string()
		.optional()
		.describe(
			'The exercise number to get quizzed on (leave blank for a random exercise).',
		),
}

export async function quizMe({
	workshopDirectory,
	exerciseNumber: providedExerciseNumber,
}: {
	workshopDirectory: string
	exerciseNumber?: string
}): Promise<GetPromptResult> {
	const workshopRoot = await handleWorkshopDirectory(workshopDirectory)
	const config = getWorkshopConfig()
	let exerciseNumber = Number(providedExerciseNumber)
	if (!providedExerciseNumber) {
		const exercises = await getExercises()
		const randomExercise =
			exercises[Math.floor(Math.random() * exercises.length)]
		exerciseNumber = randomExercise?.exerciseNumber ?? 0
	}
	return {
		messages: [
			{
				role: 'user',
				content: {
					type: 'text',
					text: `
You are an expert teacher.

Below is context about exercise ${exerciseNumber} in the workshop titled "${config.title}" (subtitled "${config.subtitle}") found at ${workshopRoot}.

Please use this context to provide quiz questions, one at a time, to me to help me solidify my understanding of this material. Ask me the question, I will provide a response, you will either congratulate my correct understanding and move on or guide me to the correct answer with follow-up questions and hints until I either ask you to tell me the answer or ask you to continue to the next question.
							`.trim(),
				},
			},
			{
				role: 'user',
				content: {
					type: 'resource',
					resource: await exerciseContextResource.getResource({
						workshopDirectory,
						exerciseNumber,
					}),
				},
			},
		],
	}
}

export function initPrompts(server: McpServer) {
	server.prompt(
		'quiz_me',
		'Have the LLM quiz you on topics from the workshop exercises',
		quizMeInputSchema,
		quizMe,
	)
}
