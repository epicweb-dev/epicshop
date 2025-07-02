import { getExercises } from '@epic-web/workshop-utils/apps.server'
import { redirect, type LoaderFunctionArgs } from 'react-router'

export async function loader({ request }: LoaderFunctionArgs) {
	const exercises = await getExercises({ request })
	if (!exercises.length) {
		throw new Response('No exercises found', { status: 404 })
	}

	const lastExercise = exercises[exercises.length - 1]
	if (!lastExercise || !lastExercise.steps || !lastExercise.steps.length) {
		throw new Response('No steps found in last exercise', { status: 404 })
	}

	const lastStep = lastExercise.steps[lastExercise.steps.length - 1]
	if (!lastStep || !lastStep.solution) {
		throw new Response('No solution found for last step', { status: 404 })
	}

	const exerciseNumber = lastExercise.exerciseNumber.toString().padStart(2, '0')
	const stepNumber = lastStep.stepNumber.toString().padStart(2, '0')
	return redirect(`/exercise/${exerciseNumber}/${stepNumber}/solution`)
}

export default function LastExerciseRedirect() {
	return null
}
