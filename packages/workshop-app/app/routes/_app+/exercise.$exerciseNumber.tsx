import type { DataFunctionArgs } from '@remix-run/node'
import { json } from '@remix-run/node'
import {
	isRouteErrorResponse,
	Outlet,
	useLoaderData,
	useRouteError,
} from '@remix-run/react'
import invariant from 'tiny-invariant'
import { Mdx } from '~/utils/mdx'
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
			<h1>{data.step.title}</h1>
			<div className="grid grid-cols-2">
				<div className="prose">
					{data.step.exercise?.instructionsCode ? (
						<Mdx code={data.step.exercise?.instructionsCode} />
					) : (
						'No instructions yet...'
					)}
				</div>
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
