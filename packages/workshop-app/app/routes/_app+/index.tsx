import {
	defer,
	type DataFunctionArgs,
	type HeadersFunction,
} from '@remix-run/node'
import { Link, useLoaderData } from '@remix-run/react'
import { EpicVideoInfoProvider } from '#app/components/epic-video.tsx'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { EditFileOnGitHub } from '#app/routes/launch-editor.tsx'
import {
	getExercises,
	getWorkshopInstructions,
	getWorkshopTitle,
} from '#app/utils/apps.server.ts'
import { getEpicVideoInfos } from '#app/utils/epic-api.ts'
import { Mdx } from '#app/utils/mdx.tsx'
import {
	combineServerTimings,
	getServerTimeHeader,
	makeTimings,
	time,
} from '#app/utils/timing.server.ts'
import { ProgressToggle } from '../progress.tsx'

export async function loader({ request }: DataFunctionArgs) {
	const timings = makeTimings('indexLoader')
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
		time(() => getWorkshopInstructions({ request }), {
			timings,
			type: 'compileMdx',
			desc: 'compileMdx in index',
		}),
	])

	return defer(
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
			epicVideoInfosPromise:
				workshopReadme.compiled.status === 'success'
					? getEpicVideoInfos(workshopReadme.compiled.epicVideoEmbeds, {
							request,
					  })
					: null,
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
		<ul className="flex flex-col divide-y divide-border dark:divide-border/50">
			<strong className="px-10 pb-3 font-mono text-xs uppercase">
				Sections
			</strong>
			{data.exercises.map(exercise => (
				<li key={exercise.exerciseNumber}>
					<Link
						className="relative flex items-center gap-4 px-4 py-3 text-lg font-semibold transition after:absolute after:right-10 after:-translate-x-2 after:opacity-0 after:transition after:content-['→'] hover:bg-gray-50 hover:after:translate-x-0 hover:after:opacity-100 dark:hover:bg-white/5"
						to={`${exercise.exerciseNumber.toString().padStart(2, '0')}`}
					>
						<span className="text-xs font-normal tabular-nums opacity-50">
							{exercise.exerciseNumber}
						</span>
						<span>{exercise.title}</span>
					</Link>
					{/* <ButtonLink
						varient="primary"
						to={`${exercise.exerciseNumber.toString().padStart(2, '0')}`}
					>
						{exercise.exerciseNumber}. {exercise.title}
					</ButtonLink> */}
				</li>
			))}
		</ul>
	)
	return (
		<main className="relative w-full">
			<article
				data-restore-scroll="true"
				className="shadow-on-scrollbox h-full w-full overflow-y-auto scrollbar-thin scrollbar-thumb-scrollbar"
			>
				<div className="flex min-h-full w-full flex-col justify-between border-r border-border md:w-3/4 lg:w-2/3">
					<div>
						<div className="pt-16">
							<h1 className="px-10 text-[6vw] font-extrabold leading-none">
								{data.title}
							</h1>
							<div className="mt-8">{exerciseLinks}</div>
						</div>
						<div className="w-full max-w-none scroll-pt-6 border-t border-border px-10 pt-8">
							<h2 className="pb-5 font-mono text-xs font-semibold uppercase">
								Intro
							</h2>
							{data.workshopReadme.compiled.status === 'success' &&
							data.workshopReadme.compiled.code ? (
								<EpicVideoInfoProvider
									epicVideoInfosPromise={data.epicVideoInfosPromise}
								>
									<div className="prose dark:prose-invert sm:prose-lg">
										<Mdx
											code={data.workshopReadme.compiled.code}
											components={{
												h1: () => null,
											}}
										/>
									</div>
									<ProgressToggle type="workshop-instructions" />
								</EpicVideoInfoProvider>
							) : data.workshopReadme.compiled.status === 'error' ? (
								<div className="text-red-500">
									There was an error:
									<pre>{data.workshopReadme.compiled.error}</pre>
								</div>
							) : (
								'No instructions yet...'
							)}
						</div>
						<div className="pb-5 pt-10">
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
				</div>
			</article>
		</main>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}
