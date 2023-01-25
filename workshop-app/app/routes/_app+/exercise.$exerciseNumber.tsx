import type { DataFunctionArgs } from '@remix-run/node'
import { json } from '@remix-run/node'
import {
	isRouteErrorResponse,
	useLoaderData,
	useRouteError,
} from '@remix-run/react'
import invariant from 'tiny-invariant'
import { getErrorMessage } from '~/utils/misc'
import { getStep } from '~/utils/misc.server'

export async function loader({ params }: DataFunctionArgs) {
	invariant(params.exerciseNumber, 'exerciseNumber is required')
	const step = await getStep(params.exerciseNumber)
	if (!step) {
		throw new Response('Not found', { status: 404 })
	}
	return json({ step })
}

export default function StepRoute() {
	const data = useLoaderData<typeof loader>()

	return (
		<div>
			This is a step!
			<pre>{JSON.stringify(data, null, 2)}</pre>
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
