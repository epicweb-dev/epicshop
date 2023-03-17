import type { DataFunctionArgs } from '@remix-run/node'
import { json } from '@remix-run/node'
import { isRouteErrorResponse, Outlet, useRouteError } from '@remix-run/react'
import invariant from 'tiny-invariant'
import Navigation from '~/components/navigation'
import { getExercises, getWorkshopTitle } from '~/utils/apps.server'
import { getErrorMessage } from '~/utils/misc'

export async function loader({ params }: DataFunctionArgs) {
	invariant(params.exerciseNumber, 'exerciseNumber is required')
	const [exercises, workshopTitle] = await Promise.all([
		getExercises(),
		getWorkshopTitle(),
	])
	const exercise = exercises.find(
		e => e.exerciseNumber === Number(params.exerciseNumber),
	)
	if (!exercise) {
		throw new Response('Not found', { status: 404 })
	}

	const result = json(
		{
			exerciseNumber: exercise.exerciseNumber,
			exerciseTitle: exercise.title,
			title: workshopTitle,
			exercises: exercises.map(e => ({
				exerciseNumber: e.exerciseNumber,
				title: e.title,
			})),
		},
		{
			headers: {
				'Cache-Control': 'public, max-age=300',
			},
		},
	)
	return result
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
