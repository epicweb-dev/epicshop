import { invariantResponse } from '@epic-web/invariant'
import {
	getExercises,
	getWorkshopTitle,
} from '@kentcdodds/workshop-utils/apps.server'
import {
	combineServerTimings,
	getServerTimeHeader,
	makeTimings,
} from '@kentcdodds/workshop-utils/timing.server'
import {
	type LoaderFunctionArgs,
	type HeadersFunction,
	json,
} from '@remix-run/node'
import { isRouteErrorResponse, Outlet, useRouteError } from '@remix-run/react'
import { getErrorMessage } from '#app/utils/misc.tsx'

export async function loader({ request, params }: LoaderFunctionArgs) {
	const timings = makeTimings('stepLoader')
	invariantResponse(params.exerciseNumber, 'exerciseNumber is required')
	const [exercises, workshopTitle] = await Promise.all([
		getExercises({ request, timings }),
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
				'Server-Timing': getServerTimeHeader(timings),
			},
		},
	)
	return result
}

export const headers: HeadersFunction = ({ loaderHeaders, parentHeaders }) => {
	const headers = {
		'Cache-Control': loaderHeaders.get('Cache-Control') ?? '',
		'Server-Timing': combineServerTimings(loaderHeaders, parentHeaders),
	}
	return headers
}

export default function StepRoute() {
	return <Outlet />
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
