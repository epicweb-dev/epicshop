import {
	type ExerciseStepApp,
	getExercise,
	getNextExerciseApp,
} from '@epic-web/workshop-utils/apps.server'
import { makeTimings } from '@epic-web/workshop-utils/timing.server'
import { redirect } from 'react-router'
import { type Route } from './+types/diff.$shortcut.ts'

export async function loader({ request, params }: Route.LoaderArgs) {
	const timings = makeTimings('diffLoader')

	const [exerciseNumber, stepNumber] = params.shortcut?.split('.') ?? []
	if (!exerciseNumber) {
		return redirect(`/diff`)
	}
	const exercise = await getExercise(Number(exerciseNumber), {
		request,
		timings,
	})
	const headers = { 'Server-Timing': timings.toString() }

	if (!exercise) return redirect(`/diff`, { headers })

	const step = stepNumber
		? exercise.steps.find((s) => s.stepNumber === Number(stepNumber))
		: exercise.steps.find(Boolean)
	const exerciseStepApp = step?.problem ?? step?.solution
	if (!exerciseStepApp) {
		return redirect(`/diff`, { headers })
	}
	let nextApp = await getNextExerciseApp(exerciseStepApp, {
		request,
		timings,
	})
	if (!nextApp) {
		nextApp = exerciseStepApp
	}

	return redirect(
		`/diff?app1=${makeId(exerciseStepApp)}&app2=${makeId(nextApp)}`,
		{ headers: { 'Server-Timing': timings.toString() } },
	)
}

function makeId(app: ExerciseStepApp) {
	return `${pad(app.exerciseNumber)}.${pad(app.stepNumber)}.${app.type}`
}

function pad(number: number) {
	return number.toString().padStart(2, '0')
}
