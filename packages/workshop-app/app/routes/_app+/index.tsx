import type { DataFunctionArgs, HeadersFunction } from '@remix-run/node'
import { json } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import path from 'path'
import { ButtonLink } from '~/components/button.tsx'
import { GeneralErrorBoundary } from '~/components/error-boundary.tsx'
import { EditFileOnGitHub } from '~/routes/launch-editor.tsx'
import {
	getExercises,
	getWorkshopRoot,
	getWorkshopTitle,
} from '~/utils/apps.server.ts'
import { compileMdx } from '~/utils/compile-mdx.server.ts'
import { Mdx } from '~/utils/mdx.tsx'
import { getErrorMessage } from '~/utils/misc.tsx'
import {
	combineServerTimings,
	getServerTimeHeader,
	makeTimings,
	time,
} from '~/utils/timing.server.ts'

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
				const compiled = await compileMdx(readmeFilepath).then(
					r => ({ ...r, status: 'success' }) as const,
					e => {
						console.error(
							`There was an error compiling the workshop readme`,
							readmeFilepath,
							e,
						)
						return { status: 'error', error: getErrorMessage(e) } as const
					},
				)
				return { compiled, file: readmeFilepath, relativePath: 'exercises' }
			},
			{ timings, type: 'compileMdx', desc: 'compileMdx in index' },
		),
	])
	return json(
		{
			title:
				workshopReadme.compiled.status === 'success'
					? workshopReadme.compiled.title
					: title,
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
				className="shadow-on-scrollbox h-full w-full overflow-y-auto scrollbar-thin scrollbar-thumb-scrollbar"
			>
				<article className="flex min-h-full w-full flex-col justify-between border-r border-border md:w-3/4 lg:w-2/3">
					<div>
						<div className="px-10 pt-16">
							<h1 className="text-[6vw] font-extrabold leading-none">
								{data.title}
							</h1>
							<div className="mt-8">{exerciseLinks}</div>
						</div>
						<div className="prose mt-16 w-full max-w-none scroll-pt-6 border-t border-border px-10 pt-16 dark:prose-invert sm:prose-lg">
							{data.workshopReadme.compiled.status === 'success' &&
							data.workshopReadme.compiled.code ? (
								<Mdx
									code={data.workshopReadme.compiled.code}
									components={{
										h1: () => null,
									}}
								/>
							) : data.workshopReadme.compiled.status === 'error' ? (
								<div className="text-red-500">
									There was an error:
									<pre>{data.workshopReadme.compiled.error}</pre>
								</div>
							) : (
								'No instructions yet...'
							)}
						</div>
						<div className="mb-10 p-10">
							{data.workshopReadme.compiled.status === 'success' &&
							data.workshopReadme.compiled.code &&
							data.workshopReadme.compiled.code?.length > 500
								? exerciseLinks
								: null}
						</div>
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

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}
