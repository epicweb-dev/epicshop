import { type DataFunctionArgs, redirect } from '@remix-run/node'
import { getExerciseApp, isProblemApp, isSolutionApp } from 'utils/apps.server'

export async function loader({ params }: DataFunctionArgs) {
	const problemApp = await getExerciseApp({ ...params, type: 'problem' }).then(
		a => (isProblemApp(a) ? a : null),
	)
	const solutionApp = await getExerciseApp({
		...params,
		type: 'solution',
	}).then(a => (isSolutionApp(a) ? a : null))
	if (problemApp) {
		return redirect(`/${params.exerciseNumber}/${params.stepNumber}/problem`)
	}
	if (solutionApp) {
		return redirect(`/${params.exerciseNumber}/${params.stepNumber}/solution`)
	}
	throw new Response('Not found', { status: 404 })
}
