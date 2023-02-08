import type { DataFunctionArgs } from '@remix-run/node'
import { json } from '@remix-run/node'
import {
	isRouteErrorResponse,
	Link,
	useLoaderData,
	useRouteError,
} from '@remix-run/react'
import invariant from 'tiny-invariant'
import { Mdx } from '~/utils/mdx'
import { getErrorMessage } from '~/utils/misc'
import { getExercise } from '~/utils/misc.server'

export async function loader({ params }: DataFunctionArgs) {
	invariant(params.exerciseNumber, 'exerciseNumber is required')
	const exercise = await getExercise(params.exerciseNumber)
	if (!exercise) {
		throw new Response('Not found', { status: 404 })
	}

	return json({ exercise })
}

export default function ExerciseNumberRoute() {
	const data = useLoaderData<typeof loader>()

	return (
		<div>
			<h1>{data.exercise.title}</h1>
			<div className="prose mx-auto overflow-y-scroll">
				{data.exercise.instructionsCode ? (
					<Mdx code={data.exercise?.instructionsCode} />
				) : (
					'No instructions yet...'
				)}
			</div>
			<Link to="01/problem">Start</Link>
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
