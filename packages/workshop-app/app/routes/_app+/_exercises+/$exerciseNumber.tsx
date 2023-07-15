import type {
	DataFunctionArgs,
	HeadersFunction,
	V2_MetaFunction,
} from '@remix-run/node'
import { json } from '@remix-run/node'
import {
	isRouteErrorResponse,
	useLoaderData,
	useRouteError,
} from '@remix-run/react'
import { ButtonLink } from '~/components/button.tsx'
import { type loader as rootLoader } from '~/root.tsx'
import { getExercises, getWorkshopTitle } from '~/utils/apps.server.ts'
import { Mdx, PreWithButtons } from '~/utils/mdx.tsx'
import { getErrorMessage, invariantResponse } from '~/utils/misc.tsx'
import {
	combineServerTimings,
	getServerTimeHeader,
	makeTimings,
	time,
} from '~/utils/timing.server.ts'

export const meta: V2_MetaFunction<
	typeof loader,
	{ root: typeof rootLoader }
> = ({ data, matches }) => {
	if (!data) {
		return [{ title: '📝 | Error' }]
	}
	const number = data.exercise.exerciseNumber.toString().padStart(2, '0')
	const rootData = matches.find(m => m.id === 'root')?.data
	return [
		{
			title: `📝 | ${number}. ${data.exercise.title} | ${rootData?.workshopTitle}`,
		},
	]
}

export async function loader({ params, request }: DataFunctionArgs) {
	const timings = makeTimings('exerciseNumberLoader')
	invariantResponse(params.exerciseNumber, 'exerciseNumber is required')
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

	const firstExerciseNumber =
		data.exercises[0]?.exerciseNumber.toString().padStart(2, '0') ?? '01'
	const firstExercisePath = `${firstExerciseNumber}/problem`
	return (
		<main className="relative h-screen w-full">
			<div
				data-restore-scroll="true"
				className="shadow-on-scrollbox scrollbar-thin scrollbar-thumb-scrollbar h-full w-full overflow-y-auto"
			>
				<article className="border-border min-h-full w-full border-r md:w-3/4 lg:w-2/3">
					<div className="px-10 pt-16">
						<h1 className="text-[6vw] font-extrabold leading-none">
							{data.exercise.title}
						</h1>
						<div className="mt-8">
							<ButtonLink
								to={firstExercisePath}
								prefetch="intent"
								varient="big"
							>
								Start Learning
							</ButtonLink>
						</div>
					</div>
					<div className="prose dark:prose-invert sm:prose-lg border-border mt-16 w-full max-w-none border-t px-10 pt-16">
						{data.exercise.instructionsCode ? (
							<Mdx
								code={data.exercise?.instructionsCode}
								components={{
									h1: () => null,
									pre: PreWithButtons,
								}}
							/>
						) : (
							'No instructions yet...'
						)}
					</div>
					<div className="flex w-full items-center p-10 pb-16">
						<ButtonLink to={firstExercisePath} prefetch="intent" varient="big">
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
