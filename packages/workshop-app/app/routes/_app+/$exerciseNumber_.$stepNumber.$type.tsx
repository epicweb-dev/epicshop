import { isRouteErrorResponse, Link, useRouteError } from '@remix-run/react'
import { getErrorMessage } from '~/utils/misc'

import type { DataFunctionArgs } from '@remix-run/node'
import { json } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { Mdx } from '~/utils/mdx'
import {
	getAppPateRoute,
	getNextExerciseApp,
	getPrevExerciseApp,
	requireExerciseApp,
} from '~/utils/misc.server'

export async function loader({ params }: DataFunctionArgs) {
	const exerciseStepApp = await requireExerciseApp({
		...params,
		type: params.type === 'diff' ? 'problem' : params.type,
	})
	const nextApp = await getNextExerciseApp(exerciseStepApp)
	const prevApp = await getPrevExerciseApp(exerciseStepApp)
	const nextStepLink = nextApp
		? {
				to: getAppPateRoute(nextApp),
				children: `${nextApp.title} (${nextApp.type}) ➡️`,
		  }
		: null
	const prevStepLink = prevApp
		? {
				to: getAppPateRoute(prevApp),
				children: `⬅️ ${prevApp.title} (${prevApp.type})`,
		  }
		: null

	return json({ exerciseStepApp, prevStepLink, nextStepLink })
}

// /exercise/01/01/problem
// /exercise/01/01/solution
// /exercise/01/01/diff

export default function ExercisePartRoute() {
	const data = useLoaderData<typeof loader>()
	return (
		<div>
			<div className="prose overflow-y-scroll">
				{data.exerciseStepApp.instructionsCode ? (
					<Mdx code={data.exerciseStepApp?.instructionsCode} />
				) : (
					'No instructions yet...'
				)}
			</div>

			<div className="flex justify-around">
				{data.prevStepLink ? (
					<Link
						className="text-blue-700 underline"
						to={data.prevStepLink.to}
						children={data.prevStepLink.children}
					/>
				) : null}
				{data.nextStepLink ? (
					<Link
						className="text-blue-700 underline"
						to={data.nextStepLink.to}
						children={data.nextStepLink.children}
					/>
				) : null}
			</div>
		</div>
	)
}

export function ErrorBoundary() {
	const error = useRouteError()

	if (typeof document !== 'undefined') {
		console.error(error)
	}

	return isRouteErrorResponse(error) ? (
		error.status === 404 ? (
			<p>Sorry, we couldn't find an app here.</p>
		) : (
			<p>
				{error.status} {error.data}
			</p>
		)
	) : (
		<p>{getErrorMessage(error)}</p>
	)
}
