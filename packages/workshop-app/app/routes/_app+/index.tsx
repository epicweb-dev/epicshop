import { ElementScrollRestoration } from '@epic-web/restore-scroll'
import {
	getExercises,
	getWorkshopInstructions,
	getWorkshopTitle,
} from '@kentcdodds/workshop-utils/apps.server'
import {
	combineServerTimings,
	getServerTimeHeader,
	makeTimings,
	time,
} from '@kentcdodds/workshop-utils/timing.server'
import {
	defer,
	type LoaderFunctionArgs,
	type HeadersFunction,
	type SerializeFrom,
} from '@remix-run/node'
import { Link, useLoaderData } from '@remix-run/react'
import slugify from '@sindresorhus/slugify'
import { EpicVideoInfoProvider } from '#app/components/epic-video.tsx'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { EditFileOnGitHub } from '#app/routes/launch-editor.tsx'
import { getEpicVideoInfos } from '#app/utils/epic-api.ts'
import { Mdx } from '#app/utils/mdx.tsx'
import { cn } from '#app/utils/misc.tsx'
import { ProgressToggle, useExerciseProgressClassName } from '../progress.tsx'

export async function loader({ request }: LoaderFunctionArgs) {
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
			articleId: `workshop-${slugify(title)}-instructions`,
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

function ExerciseListItem({
	exercise,
}: {
	exercise: SerializeFrom<typeof loader>['exercises'][number]
}) {
	const progressClassName = useExerciseProgressClassName(
		exercise.exerciseNumber,
	)
	return (
		<li key={exercise.exerciseNumber}>
			<Link
				className={cn(
					"relative flex items-center gap-4 px-4 py-3 text-lg font-semibold transition after:absolute after:right-10 after:-translate-x-2 after:opacity-0 after:transition after:content-['→'] hover:bg-gray-50 hover:after:translate-x-0 hover:after:opacity-100 dark:hover:bg-white/5",
					progressClassName,
				)}
				to={`${exercise.exerciseNumber.toString().padStart(2, '0')}`}
			>
				<span className="text-xs font-normal tabular-nums opacity-50">
					{exercise.exerciseNumber}
				</span>
				<span>{exercise.title}</span>
			</Link>
		</li>
	)
}

export default function Index() {
	const data = useLoaderData<typeof loader>()

	const exerciseLinks = (
		<ul className="flex flex-col divide-y divide-border dark:divide-border/50">
			<strong className="px-10 pb-3 font-mono text-xs uppercase">
				Sections
			</strong>
			{data.exercises.map(exercise => (
				<ExerciseListItem key={exercise.exerciseNumber} exercise={exercise} />
			))}
		</ul>
	)
	return (
		<main className="relative flex h-full w-full max-w-5xl flex-col justify-between border-r border-border md:w-3/4 xl:w-2/3">
			<article
				id={data.articleId}
				className="shadow-on-scrollbox flex w-full flex-1 flex-col gap-12 overflow-y-scroll border-border px-3 py-4 pt-6 scrollbar-thin scrollbar-thumb-scrollbar md:px-10 md:py-12 md:pt-16"
			>
				<div>
					<h1 className="px-10 text-[clamp(3rem,6vw,8.5rem)] font-extrabold leading-none">
						{data.title}
					</h1>
				</div>
				<div className="w-full max-w-none scroll-pt-6 border-t border-border px-3 pt-3 md:px-10 md:pt-8">
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
			</article>
			<ElementScrollRestoration elementQuery={`#${data.articleId}`} />
			<ProgressToggle
				type="workshop-instructions"
				className="h-14 border-t px-6"
			/>
			<div className="flex h-16 justify-center border-t border-border">
				<EditFileOnGitHub
					file={data.workshopReadme.file}
					relativePath={data.workshopReadme.relativePath}
				/>
			</div>
		</main>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}
