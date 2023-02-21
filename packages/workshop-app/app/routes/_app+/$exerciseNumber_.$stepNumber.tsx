import type { DataFunctionArgs } from '@remix-run/node'
import { json } from '@remix-run/node'
import {
	isRouteErrorResponse,
	Link,
	Outlet,
	useLoaderData,
	useParams,
	useRouteError,
} from '@remix-run/react'
import invariant from 'tiny-invariant'
import { getErrorMessage } from '~/utils/misc'
import { getExercise } from '~/utils/apps.server'

export async function loader({ params }: DataFunctionArgs) {
	invariant(params.exerciseNumber, 'exerciseNumber is required')
	const exercise = await getExercise(params.exerciseNumber)
	if (!exercise) {
		throw new Response('Not found', { status: 404 })
	}

	return json({
		exerciseNumber: exercise.exerciseNumber,
		exerciseTitle: exercise.title,
	})
}

export default function StepRoute() {
	const data = useLoaderData<typeof loader>()
	const params = useParams()

	return (
		<div className="flex flex-grow flex-col bg-gray-50 p-5">
			<h1>
				<Link
					className="inline-block pb-3 text-sm font-semibold uppercase text-gray-600 hover:underline"
					to={`/${data.exerciseNumber.toString().padStart(2, '0')}`}
				>
					{data.exerciseTitle}
					{params.type === 'solution'
						? ' (🏁 solution)'
						: params.type === 'problem'
						? ' (💪 problem)'
						: null}
				</Link>
			</h1>
			<Outlet />
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
