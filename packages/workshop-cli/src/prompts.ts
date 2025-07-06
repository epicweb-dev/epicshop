import { getExercises } from '@epic-web/workshop-utils/apps.server'
import { getWorkshopConfig } from '@epic-web/workshop-utils/config.server'
import { z } from 'zod'
import { getExerciseContext } from './resources.js'
import {
	handleWorkshopDirectory,
	workshopDirectoryInputSchema,
} from './utils.js'

export const quizMeSchema = z.object({
	workshopDirectory: workshopDirectoryInputSchema,
	exerciseNumber: z
		.string()
		.optional()
		.describe(
			`The exercise number to get quizzed on (e.g., \`4\`). Leave blank for a random exercise.`,
		),
})

export async function quizMe(input: z.infer<typeof quizMeSchema>) {
	const { workshopDirectory, exerciseNumber: providedExerciseNumber } = input
	const workshopRoot = await handleWorkshopDirectory(workshopDirectory)
	const config = getWorkshopConfig()
	let exerciseNumber = Number(providedExerciseNumber)
	if (!providedExerciseNumber) {
		const exercises = await getExercises()
		const randomExercise =
			exercises[Math.floor(Math.random() * exercises.length)]
		exerciseNumber = randomExercise?.exerciseNumber ?? 0
	}
	
	const exerciseContext = await getExerciseContext({
		workshopDirectory,
		exerciseNumber,
	})

	const prompt = `
You are an expert teacher.

Below is context about exercise ${exerciseNumber} in the workshop titled "${config.title}" (subtitled "${config.subtitle}") found at ${workshopRoot}.

Please use this context to provide quiz questions, one at a time, to me to help me solidify my understanding of this material. Ask me the question, I will provide a response, you will either congratulate my correct understanding and move on or guide me to the correct answer with follow-up questions and hints until I either ask you to tell me the answer or ask you to continue to the next question.

Exercise Context:
${JSON.stringify(exerciseContext, null, 2)}
	`.trim()

	return {
		prompt,
		exerciseContext,
	}
}