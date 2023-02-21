import type { DataFunctionArgs, V2_MetaFunction } from '@remix-run/node'
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
import { getExercise } from '~/utils/apps.server'
import { type loader as rootLoader } from '~/root'

export const meta: V2_MetaFunction<
	typeof loader,
	{ root: typeof rootLoader }
> = ({ data, parentsData }) => {
	const number = data.exercise.exerciseNumber.toString().padStart(2, '0')
	return [
		{
			title: `📝 | ${number}. ${data.exercise.title} | ${parentsData.root.workshopTitle}`,
		},
	]
}

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
		<main className="flex flex-grow flex-col items-center bg-gray-50">
			<article className="w-full max-w-4xl bg-white px-5 pt-16 pb-32 shadow-2xl shadow-gray-300/40 md:px-8">
				<h1 className="mb-12 text-4xl font-bold">{data.exercise.title}</h1>
				<div className="prose sm:prose-lg mx-auto max-w-none">
					{data.exercise.instructionsCode ? (
						<Mdx
							code={data.exercise?.instructionsCode}
							components={{ h1: () => null }}
						/>
					) : (
						'No instructions yet...'
					)}
				</div>
			</article>
			<aside className="fixed bottom-10 z-10 flex w-full max-w-4xl justify-center">
				<Link
					to="01/problem"
					prefetch="intent"
					className="rounded-full bg-gradient-to-tr from-indigo-500 to-indigo-600 px-6 py-3 text-2xl font-semibold text-white shadow-xl shadow-indigo-700/20"
				>
					Start
				</Link>
			</aside>
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
