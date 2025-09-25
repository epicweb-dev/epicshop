import { getExercises } from '@epic-web/workshop-utils/apps.server'
import type z from 'zod'
import { type error404Schema } from './error-boundary.tsx'

export async function getStep404Data({
	exerciseNumber: exerciseNumberString,
}: {
	exerciseNumber: string
}) {
	// Get exercise info for the 404 error
	const exerciseNumber = Number(exerciseNumberString)
	let exerciseTitle = 'Untitled Exercise'
	const availableSteps: Array<{
		stepNumber: number
		title: string
		hasProblem: boolean
		hasSolution: boolean
	}> = []

	try {
		const exercises = await getExercises()
		const exercise = exercises.find((e) => e.exerciseNumber === exerciseNumber)
		if (!exercise) {
			return getExercise404Data({ exercises })
		}
		exerciseTitle = exercise.title
		for (const step of exercise.steps) {
			if (!step.problem && !step.solution) continue

			availableSteps.push({
				stepNumber: step.stepNumber,
				title: step.problem?.title ?? step.solution?.title ?? 'Untitled Step',
				hasProblem: Boolean(step.problem),
				hasSolution: Boolean(step.solution),
			})
		}
	} catch {}

	return {
		type: 'step-not-found',
		steps: availableSteps.sort((a, b) => a.stepNumber - b.stepNumber),
		exerciseNumber,
		exerciseTitle,
	} satisfies z.infer<typeof error404Schema>
}

export function getExercise404Data({
	exercises,
}: {
	exercises: Array<
		Pick<
			Awaited<ReturnType<typeof getExercises>>[number],
			'title' | 'exerciseNumber'
		>
	>
}) {
	return {
		type: 'exercise-not-found',
		exercises: exercises.map((e) => ({
			title: e.title,
			number: e.exerciseNumber,
		})),
	} satisfies z.infer<typeof error404Schema>
}
