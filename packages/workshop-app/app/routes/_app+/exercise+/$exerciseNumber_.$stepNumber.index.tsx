import { invariantResponse } from '@epic-web/invariant'
import {
	getExerciseApp,
	isProblemApp,
	isSolutionApp,
} from '@epic-web/workshop-utils/apps.server'
import { redirect, type LoaderFunctionArgs } from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { getStep404Data } from './__shared/error-boundary.server.ts'
import { Exercise404ErrorBoundary } from './__shared/error-boundary.tsx'

export async function loader({ params }: LoaderFunctionArgs) {
	invariantResponse(params.exerciseNumber, 'exerciseNumber is required')
	const problemApp = await getExerciseApp({ ...params, type: 'problem' }).then(
		(a) => (isProblemApp(a) ? a : null),
	)
	if (problemApp) {
		return redirect(
			`/exercise/${params.exerciseNumber}/${params.stepNumber}/problem`,
		)
	}
	const solutionApp = await getExerciseApp({
		...params,
		type: 'solution',
	}).then((a) => (isSolutionApp(a) ? a : null))
	if (solutionApp) {
		return redirect(
			`/exercise/${params.exerciseNumber}/${params.stepNumber}/solution`,
		)
	}
	throw Response.json(
		await getStep404Data({ exerciseNumber: params.exerciseNumber }),
		{ status: 404 },
	)
}

export function ErrorBoundary() {
	return (
		<GeneralErrorBoundary
			className="container flex items-center justify-center"
			statusHandlers={{
				404: Exercise404ErrorBoundary,
			}}
		/>
	)
}
