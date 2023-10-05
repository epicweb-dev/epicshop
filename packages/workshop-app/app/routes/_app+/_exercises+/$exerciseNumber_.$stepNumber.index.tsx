import { type DataFunctionArgs, redirect } from '@remix-run/node'
import {
	getExerciseApp,
	isProblemApp,
	isSolutionApp,
} from '#app/utils/apps.server.ts'

export async function loader({ params }: DataFunctionArgs) {
	const problemApp = await getExerciseApp({ ...params, type: 'problem' }).then(
		a => (isProblemApp(a) ? a : null),
	)
	if (problemApp) {
		return redirect(`/${params.exerciseNumber}/${params.stepNumber}/problem`)
	}
	const solutionApp = await getExerciseApp({
		...params,
		type: 'solution',
	}).then(a => (isSolutionApp(a) ? a : null))
	if (solutionApp) {
		return redirect(`/${params.exerciseNumber}/${params.stepNumber}/solution`)
	}
	throw new Response('Not found', { status: 404 })
}
