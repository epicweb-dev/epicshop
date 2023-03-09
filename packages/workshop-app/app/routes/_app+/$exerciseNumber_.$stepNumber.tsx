import type { DataFunctionArgs } from '@remix-run/node'
import { json } from '@remix-run/node'
import { isRouteErrorResponse, Outlet, useRouteError } from '@remix-run/react'
import invariant from 'tiny-invariant'
import { getErrorMessage } from '~/utils/misc'
import { getExercise } from '~/utils/apps.server'
import {
	getExampleApps,
	getExercises,
	getWorkshopTitle,
} from '~/utils/apps.server'
import { isAppRunning } from '~/utils/process-manager.server'
import Navigation from '~/components/navigation'

export async function loader({ params }: DataFunctionArgs) {
	invariant(params.exerciseNumber, 'exerciseNumber is required')
	const exercise = await getExercise(params.exerciseNumber)
	if (!exercise) {
		throw new Response('Not found', { status: 404 })
	}

	return json({
		exerciseNumber: exercise.exerciseNumber,
		exerciseTitle: exercise.title,
		title: await getWorkshopTitle(),
		exercises: (await getExercises()).map(e => ({
			exerciseNumber: e.exerciseNumber,
			title: e.title,
		})),
		examples: (await getExampleApps()).map(e => ({
			name: e.name,
			title: e.title,
			isRunning: isAppRunning(e),
		})),
	})
}

export default function StepRoute() {
	return (
		<div className="flex flex-grow">
			<Navigation />
			<div className="flex flex-grow">
				<Outlet />
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
			<p>Sorry, we couldn't find that step.</p>
		) : (
			<p>
				{error.status} {error.data}
			</p>
		)
	) : (
		<p>{getErrorMessage(error)}</p>
	)
}
