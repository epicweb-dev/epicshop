import type { DataFunctionArgs } from '@remix-run/node'
import { json } from '@remix-run/node'
import {
	isRouteErrorResponse,
	useLoaderData,
	useRouteError,
} from '@remix-run/react'
import { getErrorMessage } from '~/utils/misc'
import {
	getApps,
	isExerciseApp,
	isExtraCreditExerciseApp,
	isExtraCreditFinalApp,
	isFinalApp,
} from '~/utils/misc.server'
import { isRunning } from '~/utils/process-manager.server'

export async function loader({ params }: DataFunctionArgs) {
	const { exerciseNumber, part = 'exercise', extraCreditNumber = '0' } = params
	if (part !== 'exercise' && part !== 'final') {
		throw new Response('Not found', { status: 404 })
	}

	const ec = Number(extraCreditNumber)
	const en = Number(exerciseNumber)

	const isEC = ec > 0

	const apps = await getApps()
	const app = apps.find(app => {
		if (part === 'exercise') {
			if (isEC) {
				if (isExtraCreditExerciseApp(app)) {
					return app.exerciseNumber === en && app.extraCreditNumber === ec
				}
			} else if (isExerciseApp(app)) {
				return app.exerciseNumber === en
			}
		}
		if (part === 'final') {
			if (isEC) {
				if (isExtraCreditFinalApp(app)) {
					return app.exerciseNumber === en && app.extraCreditNumber === ec
				}
			} else if (isFinalApp(app)) {
				return app.exerciseNumber === en
			}
		}
		return false
	})
	if (!app) {
		throw new Response('Not found', { status: 404 })
	}

	return json({ isRunning: isRunning(app), app })
}

export default function ExercisePartRoute() {
	const data = useLoaderData<typeof loader>()

	return <pre>{JSON.stringify(data, null, 2)}</pre>
}

export function ErrorBoundary() {
	const error = useRouteError()

	if (typeof document !== 'undefined') {
		console.error(error)
	}

	return isRouteErrorResponse(error) ? (
		error.status === 404 ? (
			<p>Sorry, we couldn't find an exercise here.</p>
		) : (
			<p>
				{error.status} {error.data}
			</p>
		)
	) : (
		<p>{getErrorMessage(error)}</p>
	)
}
