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
import { getTopic } from '~/utils/misc.server'

export async function loader({ params }: DataFunctionArgs) {
	invariant(params.topicNumber, 'topicNumber is required')
	const topic = await getTopic(params.topicNumber)
	if (!topic) {
		throw new Response('Not found', { status: 404 })
	}
	return json({ topic })
}

export default function StepRoute() {
	const data = useLoaderData<typeof loader>()

	return (
		<div>
			<h1>{data.topic.title}</h1>
			<div className="grid grid-cols-2">
				<div className="prose overflow-y-scroll">
					{data.topic.exercise?.instructionsCode ? (
						<Mdx code={data.topic.exercise?.instructionsCode} />
					) : (
						'No instructions yet...'
					)}
				</div>
				<div className="overflow-y-scroll">
					<Outlet />
				</div>
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
