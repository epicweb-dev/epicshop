import type { DataFunctionArgs, HeadersFunction } from '@remix-run/node'
import { json } from '@remix-run/node'
import { Link, useLoaderData } from '@remix-run/react'
import path from 'path'
import { ButtonLink } from '~/components/button.tsx'
import {
	getExercises,
	getWorkshopRoot,
	getWorkshopTitle,
} from '~/utils/apps.server.ts'
import { compileMdx } from '~/utils/compile-mdx.server.ts'
import { Mdx, PreWithButtons } from '~/utils/mdx.tsx'
import {
	combineServerTimings,
	getServerTimeHeader,
	makeTimings,
	time,
} from '~/utils/timing.server.ts'
import { EditFileOnGitHub } from '~/routes/launch-editor.tsx'

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
				return { ...compiled, file: readmeFilepath, relativePath: 'exercises' }
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
		<main className="relative w-full">
			<div
				data-restore-scroll="true"
				className="shadow-on-scrollbox scrollbar-thin scrollbar-thumb-scrollbar h-full w-full overflow-y-auto"
			>
				<article className="h-full w-full border-r border-border md:w-3/4 lg:w-2/3">
					<div className="px-10 pt-16">
						<h1 className="text-[6vw] font-extrabold leading-none">
							{data.title}
						</h1>
						<div className="mt-8">{exerciseLinks}</div>
					</div>
					<div className="prose dark:prose-invert sm:prose-lg border-border mt-16 w-full max-w-none border-t px-10 pt-16">
						{data.workshopReadme.code ? (
							<Mdx
								code={data.workshopReadme.code}
								components={{
									h1: () => null,
									pre: PreWithButtons,
									// @ts-expect-error 🤷‍♂️ this is fine
									Link,
								}}
							/>
						) : (
							'No instructions yet...'
						)}
					</div>
					<div className="mb-10 p-10">
						{data.workshopReadme.code?.length > 500 ? exerciseLinks : null}
					</div>
					<div className="flex h-[52px] justify-center border-t border-border">
						<EditFileOnGitHub
							file={data.workshopReadme.file}
							relativePath={data.workshopReadme.relativePath}
						/>
					</div>
				</article>
			</div>
		</main>
	)
}
