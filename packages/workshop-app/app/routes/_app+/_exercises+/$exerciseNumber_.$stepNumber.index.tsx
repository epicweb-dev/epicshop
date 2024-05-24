import {
	getExerciseApp,
	isProblemApp,
	isSolutionApp,
} from '@epic-web/workshop-utils/apps.server'
import { redirect, type LoaderFunctionArgs } from '@remix-run/node'

export async function loader({ params }: LoaderFunctionArgs) {
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
