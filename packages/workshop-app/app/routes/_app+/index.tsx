import path from 'path'
import type { DataFunctionArgs, HeadersFunction } from '@remix-run/node'
import { json } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { compileMdx } from '~/utils/compile-mdx.server'
import { ButtonLink } from '~/components/button'
import {
	getExercises,
	getWorkshopRoot,
	getWorkshopTitle,
} from '~/utils/apps.server'
import {
	combineServerTimings,
	getServerTimeHeader,
	makeTimings,
	time,
} from '~/utils/timing.server'
import { Mdx, PreWithCopyToClipboard } from '~/utils/mdx'

export async function loader({ request }: DataFunctionArgs) {
	const timings = makeTimings('indexLoader')
	const workshopRoot = getWorkshopRoot()
	const [title, exercises, workshopReadme] = await Promise.all([
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
		time(
			async () => {
				const readmeFilepath = path.join(
					workshopRoot,
					'exercises',
					'README.mdx',
				)
				const compiled = await compileMdx(readmeFilepath)
				return compiled
			},
			{ timings, type: 'compileMdx', desc: 'compileMdx in index' },
		),
	])
	return json(
		{
			title: workshopReadme.title ?? title,
			exercises: exercises.map(e => ({
				exerciseNumber: e.exerciseNumber,
				title: e.title,
			})),
			workshopReadme,
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

	const exerciseLinks = (
		<ul className="flex flex-wrap gap-4">
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
	)
	return (
		<main className="relative h-screen w-full">
			<div className="shadow-on-scrollbox scrollbar-thin scrollbar-thumb-gray-300 h-full w-full overflow-y-auto">
				<article className="min-h-full w-full border-r border-gray-200 md:w-3/4 lg:w-2/3">
					<div className="px-10 pt-16">
						<h1 className="text-[6vw] font-extrabold leading-none">
							{data.title}
						</h1>
						<div className="mt-8">{exerciseLinks}</div>
					</div>
					<div className="prose sm:prose-lg mt-16 w-full max-w-none border-t border-gray-200 px-10 pt-16">
						{data.workshopReadme.code ? (
							<Mdx
								code={data.workshopReadme.code}
								components={{
									h1: () => null,
									pre: PreWithCopyToClipboard,
								}}
							/>
						) : (
							'No instructions yet...'
						)}
					</div>
					<div className="mb-10 p-10">
						{data.workshopReadme.code?.length > 500 ? exerciseLinks : null}
					</div>
				</article>
			</div>
		</main>
	)
}
