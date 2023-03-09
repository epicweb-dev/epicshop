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
import Navigation from '~/components/navigation'
import {
	getExampleApps,
	getExercises,
	getWorkshopTitle,
} from '~/utils/apps.server'
import { isAppRunning } from '~/utils/process-manager.server'

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

	return json({
		exercise,
		exerciseNumber: exercise.exerciseNumber,
		exerciseTitle: exercise.title,
		title: await getWorkshopTitle(),
		exercises: (await getExercises()).map(e => ({
			exerciseNumber: e.exerciseNumber,
			title: e.title,
		})),
		examples: (await getExampleApps()).map(e => ({
			name: e.name,
			title: e.title,
			isRunning: isAppRunning(e),
		})),
	})
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
						<Link
							to="01/problem"
							prefetch="intent"
							className="clip-path-button mt-8 inline-flex bg-black px-8 py-4 text-xl font-bold text-white"
						>
							Start Learning
						</Link>
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
						<Link
							to="01/problem"
							prefetch="intent"
							className="clip-path-button mt-8 inline-flex bg-black px-8 py-4 text-xl font-bold text-white"
						>
							Start Learning
						</Link>
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
