import type {
	DataFunctionArgs,
	HeadersFunction,
	MetaFunction,
} from '@remix-run/node'
import { json } from '@remix-run/node'
import {
	isRouteErrorResponse,
	useLoaderData,
	useRouteError,
} from '@remix-run/react'
import path from 'path'
import { ButtonLink } from '~/components/button.tsx'
import { type loader as rootLoader } from '~/root.tsx'
import { EditFileOnGitHub } from '~/routes/launch-editor.tsx'
import {
	getExercises,
	getWorkshopRoot,
	getWorkshopTitle,
} from '~/utils/apps.server.ts'
import { Mdx } from '~/utils/mdx.tsx'
import { getErrorMessage, invariantResponse } from '~/utils/misc.tsx'
import {
	combineServerTimings,
	getServerTimeHeader,
	makeTimings,
	time,
} from '~/utils/timing.server.ts'

export const meta: MetaFunction<typeof loader, { root: typeof rootLoader }> = ({
	data,
	matches,
}) => {
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

	const readmeFilepath = path.join(
		getWorkshopRoot(),
		'exercises',
		exercise.dirName,
		'README.mdx',
	)

	const firstStep = exercise.steps.find(Boolean)
	return json(
		{
			exercise,
			exerciseNumber: exercise.exerciseNumber,
			exerciseReadme: {
				file: readmeFilepath,
				relativePath: `exercises/${exercise.dirName}`,
			},
			exerciseTitle: exercise.title,
			firstStep,
			firstType: firstStep?.problem ? 'problem' : 'solution',
			title: workshopTitle,
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

	const firstStepNumber = String(data.firstStep?.stepNumber ?? '01')
	const firstStepPath = `${firstStepNumber.padStart(2, '0')}/${data.firstType}`
	return (
		<main className="relative flex h-full w-full max-w-5xl flex-col justify-between border-r border-border md:w-3/4 lg:w-2/3">
			<article
				data-restore-scroll="true"
				className="shadow-on-scrollbox flex w-full flex-1 flex-col gap-12 overflow-y-scroll border-border px-10 py-12 pt-16 scrollbar-thin scrollbar-thumb-scrollbar"
			>
				<div>
					<h1 className="text-[6vw] font-extrabold leading-none">
						{data.exercise.title}
					</h1>
					<div className="mt-8">
						<ButtonLink to={firstStepPath} prefetch="intent" varient="big">
							Start Learning
						</ButtonLink>
					</div>
				</div>
				<div className="prose dark:prose-invert sm:prose-lg">
					{data.exercise.instructionsCode ? (
						<Mdx
							code={data.exercise?.instructionsCode}
							components={{
								h1: () => null,
							}}
						/>
					) : (
						'No instructions yet...'
					)}
				</div>
				<div className="flex w-full items-center">
					<ButtonLink to={firstStepPath} prefetch="intent" varient="big">
						Start Learning
					</ButtonLink>
				</div>
			</article>
			<div className="flex h-[52px] justify-center border-t border-border">
				<EditFileOnGitHub
					file={data.exerciseReadme.file}
					relativePath={data.exerciseReadme.relativePath}
				/>
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
