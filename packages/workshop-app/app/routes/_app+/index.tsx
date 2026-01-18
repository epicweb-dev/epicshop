import { ElementScrollRestoration } from '@epic-web/restore-scroll'
import {
	getExercises,
	getWorkshopInstructions,
} from '@epic-web/workshop-utils/apps.server'
import { getWorkshopConfig } from '@epic-web/workshop-utils/config.server'
import { getEpicVideoInfos } from '@epic-web/workshop-utils/epic-api.server'
import {
	combineServerTimings,
	getServerTimeHeader,
	makeTimings,
	time,
} from '@epic-web/workshop-utils/timing.server'
import slugify from '@sindresorhus/slugify'
import { data, type HeadersFunction, Link } from 'react-router'
import { EpicVideoInfoProvider } from '#app/components/epic-video.tsx'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { EditFileOnGitHub } from '#app/routes/launch-editor.tsx'
import { Mdx } from '#app/utils/mdx.tsx'
import { cn } from '#app/utils/misc.tsx'
import { ProgressToggle, useExerciseProgressClassName } from '../progress.tsx'
import { type Route } from './+types/index.tsx'

export async function loader({ request }: Route.LoaderArgs) {
	const timings = makeTimings('indexLoader')
	const { title } = getWorkshopConfig()
	const [exercises, workshopReadme] = await Promise.all([
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

	return data(
		{
			articleId: `workshop-${slugify(title)}-instructions`,
			title:
				workshopReadme.compiled.status === 'success'
					? workshopReadme.compiled.title
					: title,
			exercises: exercises.map((e) => ({
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
	index,
	exercise,
}: {
	index: number
	exercise: Awaited<Route.ComponentProps['loaderData']>['exercises'][number]
}) {
	const progressClassName = useExerciseProgressClassName(
		exercise.exerciseNumber,
	)
	return (
		<li key={exercise.exerciseNumber}>
			<Link
				className={cn(
					"hover:bg-muted/60 relative flex items-center gap-4 px-4 py-3 text-lg font-semibold transition after:absolute after:right-10 after:-translate-x-2 after:opacity-0 after:transition after:content-['→'] hover:after:translate-x-0 hover:after:opacity-100",
					progressClassName,
				)}
				to={`${exercise.exerciseNumber.toString().padStart(2, '0')}`}
				data-keyboard-action={index === 0 ? 'g+n' : undefined}
			>
				<span className="text-xs font-normal tabular-nums opacity-50">
					{exercise.exerciseNumber}
				</span>
				<span>{exercise.title}</span>
			</Link>
		</li>
	)
}

const mdxComponents = { h1: () => null }

export default function Index({ loaderData: data }: Route.ComponentProps) {
	const exerciseLinks = (
		<ul className="divide-border dark:divide-border/50 flex flex-col divide-y">
			<strong className="px-10 pb-3 font-mono text-xs uppercase">
				Exercises
			</strong>
			{data.exercises.map((exercise, index) => (
				<ExerciseListItem
					key={exercise.exerciseNumber}
					index={index}
					exercise={exercise}
				/>
			))}
		</ul>
	)
	return (
		<main className="relative flex h-full w-full max-w-5xl flex-col justify-between border-r md:w-3/4 xl:w-2/3">
			<article
				id={data.articleId}
				className="shadow-on-scrollbox scrollbar-thin scrollbar-thumb-scrollbar flex w-full flex-1 flex-col gap-12 overflow-y-scroll px-3 py-4 pt-6 md:px-10 md:py-12 md:pt-16"
			>
				<div>
					<h1 className="px-10 text-[clamp(3rem,6vw,7.5rem)] leading-none font-extrabold">
						{data.title}
					</h1>
				</div>
				<div className="w-full max-w-none scroll-pt-6 border-t px-3 pt-3 md:px-10 md:pt-8">
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
									components={mdxComponents}
								/>
							</div>
						</EpicVideoInfoProvider>
					) : data.workshopReadme.compiled.status === 'error' ? (
						<div className="text-foreground-destructive">
							There was an error:
							<pre>{data.workshopReadme.compiled.error}</pre>
						</div>
					) : (
						'No instructions yet...'
					)}
				</div>
				<div className="pt-10 pb-5">
					{data.workshopReadme.compiled.status === 'success' &&
					data.workshopReadme.compiled.code &&
					data.workshopReadme.compiled.code.length > 500
						? exerciseLinks
						: null}
				</div>
			</article>
			<ElementScrollRestoration elementQuery={`#${data.articleId}`} />
			<ProgressToggle
				type="workshop-instructions"
				className="h-14 border-t px-6"
			/>
			<div className="@container flex h-16 justify-center border-t">
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
