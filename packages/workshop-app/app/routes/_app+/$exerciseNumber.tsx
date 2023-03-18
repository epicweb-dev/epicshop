import type {
	DataFunctionArgs,
	HeadersFunction,
	V2_MetaFunction,
} from '@remix-run/node'
import { json } from '@remix-run/node'
import {
	isRouteErrorResponse,
	Link,
	useLoaderData,
	useRouteError,
} from '@remix-run/react'
import invariant from 'tiny-invariant'
import { ButtonLink } from '~/components/button'
import Navigation from '~/components/navigation'
import { type loader as rootLoader } from '~/root'
import { getExercises, getWorkshopTitle } from '~/utils/apps.server'
import { Mdx } from '~/utils/mdx'
import { getErrorMessage } from '~/utils/misc'
import {
	combineServerTimings,
	getServerTimeHeader,
	makeTimings,
	time,
} from '~/utils/timing.server'

export const meta: V2_MetaFunction<
	typeof loader,
	{ root: typeof rootLoader }
> = ({ data, parentsData }) => {
	if (!data) {
		return [{ title: '📝 | Error' }]
	}
	const number = data.exercise.exerciseNumber.toString().padStart(2, '0')
	return [
		{
			title: `📝 | ${number}. ${data.exercise.title} | ${parentsData.root.workshopTitle}`,
		},
	]
}

export async function loader({ params, request }: DataFunctionArgs) {
	const timings = makeTimings('exerciseNumberLoader')
	invariant(params.exerciseNumber, 'exerciseNumber is required')
	const [exercises, workshopTitle] = await Promise.all([
		time(() => getExercises({ request, timings }), {
			timings,
			type: 'getExercises',
			desc: 'getExercises in $exerciseNumber.tsx',
		}),
		time(() => getWorkshopTitle(), {
			timings,
			type: 'getWorkshopTitle',
			desc: 'getWorkshopTitle in $exerciseNumber.tsx',
		}),
	])
	const exercise = exercises.find(
		e => e.exerciseNumber === Number(params.exerciseNumber),
	)
	if (!exercise) {
		throw new Response('Not found', { status: 404 })
	}

	return json(
		{
			exercise,
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
				'Server-Timing': getServerTimeHeader(timings),
				'Cache-Control': 'public, max-age=300',
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

export default function ExerciseNumberRoute() {
	const data = useLoaderData<typeof loader>()

	return (
		<main className="flex flex-grow">
			<Navigation />
			<div className="grid h-screen w-full flex-grow grid-cols-3 overflow-y-auto">
				<article className="col-span-2 w-full border-r border-gray-200 pt-16">
					<div className="px-10">
						<h1 className="text-[6vw] font-extrabold leading-none">
							{data.exercise.title}
						</h1>
						<div className="mt-8">
							<ButtonLink to="01/problem" prefetch="intent" varient="big">
								Start Learning
							</ButtonLink>
						</div>
					</div>
					<div className="prose sm:prose-lg mt-16 w-full max-w-none border-t border-gray-200 px-10 pt-16">
						{data.exercise.instructionsCode ? (
							<Mdx
								code={data.exercise?.instructionsCode}
								components={{ h1: () => null }}
							/>
						) : (
							'No instructions yet...'
						)}
					</div>
					<div className="flex w-full items-center p-10 pb-16">
						<ButtonLink to="01/problem" prefetch="intent" varient="big">
							Start Learning
						</ButtonLink>
					</div>
				</article>
			</div>
		</main>
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
