import { DataFunctionArgs, HeadersFunction, json } from '@remix-run/node'
import { Link, useLoaderData } from '@remix-run/react'
import { ButtonLink } from '~/components/button'
import { getExercises, getWorkshopTitle } from '~/utils/apps.server'
import {
	combineServerTimings,
	getServerTimeHeader,
	makeTimings,
	time,
} from '~/utils/timing.server'

export async function loader({ request }: DataFunctionArgs) {
	const timings = makeTimings('indexLoader')
	const [title, exercises] = await Promise.all([
		time(() => getWorkshopTitle(), {
			timings,
			type: 'getWorkshopTitle',
			desc: 'getWorkshopTitle in index',
		}),
		time(() => getExercises({ request, timings }), {
			timings,
			type: 'getExercises',
			desc: 'getExercises in index',
		}),
	])
	return json(
		{
			title,
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
}

export const headers: HeadersFunction = ({ loaderHeaders, parentHeaders }) => {
	const headers = {
		'Cache-Control': loaderHeaders.get('Cache-Control') ?? '',
		'Server-Timing': combineServerTimings(loaderHeaders, parentHeaders),
	}
	return headers
}

export default function Index() {
	const data = useLoaderData<typeof loader>()
	return (
		<main className="flex min-h-screen items-center justify-center">
			<div>
				<h1 className="mb-10 text-4xl font-extrabold">{data.title}</h1>
				<div>
					<ul className="flex flex-col gap-2">
						{data.exercises.map(exercise => (
							<li key={exercise.exerciseNumber}>
								<ButtonLink
									varient="primary"
									to={`${exercise.exerciseNumber.toString().padStart(2, '0')}`}
								>
									{exercise.exerciseNumber}. {exercise.title}
								</ButtonLink>
							</li>
						))}
					</ul>
				</div>
			</div>
		</main>
	)
}
