import path from 'path'
import { invariantResponse } from '@epic-web/invariant'
import { ElementScrollRestoration } from '@epic-web/restore-scroll'
import {
	getAppPageRoute,
	getApps,
	getExercise,
	getWorkshopRoot,
	isExtraApp,
	isExerciseStepApp,
} from '@epic-web/workshop-utils/apps.server'
import { getWorkshopConfig } from '@epic-web/workshop-utils/config.server'
import { getEpicVideoInfos } from '@epic-web/workshop-utils/epic-api.server'
import {
	combineServerTimings,
	getServerTimeHeader,
	makeTimings,
} from '@epic-web/workshop-utils/timing.server'
import slugify from '@sindresorhus/slugify'
import * as React from 'react'
import { data, type HeadersFunction, Link } from 'react-router'
import { EpicVideoInfoProvider } from '#app/components/epic-video.tsx'
import { Icon } from '#app/components/icons.tsx'
import { Loading } from '#app/components/loading.tsx'
import { NavChevrons } from '#app/components/nav-chevrons.tsx'
import { RetrievalPractice } from '#app/components/retrieval-practice.tsx'
import { useRevalidationWS } from '#app/components/revalidation-ws.tsx'
import { EditFileOnGitHub } from '#app/routes/launch-editor.tsx'
import { ProgressToggle } from '#app/routes/progress.tsx'
import { useTheme } from '#app/routes/theme/index.tsx'
import { Mdx } from '#app/utils/mdx.tsx'
import { cn } from '#app/utils/misc.tsx'
import { useIsOnline } from '#app/utils/online.ts'
import { getRootMatchLoaderData } from '#app/utils/root-loader.ts'
import { getSeoMetaTags } from '#app/utils/seo.ts'
import { type Route } from './+types/$exerciseNumber_.finished.tsx'

export const meta: Route.MetaFunction = ({ loaderData, matches }) => {
	const number = loaderData?.exercise.exerciseNumber.toString().padStart(2, '0')

	const rootData = getRootMatchLoaderData(matches)
	if (!loaderData || !rootData) return [{ title: '🦉 | Error' }]

	return getSeoMetaTags({
		title: `🦉 | ${number}. ${loaderData.exercise.title} | ${rootData?.workshopTitle}`,
		description: `Elaboration for ${number}. ${loaderData.exercise.title}`,
		ogTitle: `Finished: ${loaderData.exercise.title}`,
		ogDescription: `Elaboration for exercise ${Number(number)}`,
		instructor: rootData.instructor,
		requestInfo: rootData.requestInfo,
	})
}

export async function loader({ request, params }: Route.LoaderArgs) {
	const timings = makeTimings('exerciseFinishedLoader')
	invariantResponse(params.exerciseNumber, 'exerciseNumber is required')
	const exercise = await getExercise(params.exerciseNumber, {
		timings,
		request,
	})
	if (!exercise) {
		throw new Response('Not found', { status: 404 })
	}
	const workshopConfig = getWorkshopConfig()
	const exerciseFormTemplate = workshopConfig.forms.exercise
	const exerciseFormEmbedUrl = exerciseFormTemplate
		.replace('{workshopTitle}', encodeURIComponent(workshopConfig.title))
		.replace('{exerciseTitle}', encodeURIComponent(exercise.title))
	const nextExercise = await getExercise(exercise.exerciseNumber + 1, {
		timings,
		request,
	})

	const finishedFilepath = path.join(
		getWorkshopRoot(),
		'exercises',
		exercise.dirName,
		'FINISHED.mdx',
	)

	const apps = await getApps({ request, timings })
	const hasExtras = apps.some(isExtraApp)
	const exerciseApps = apps
		.filter(isExerciseStepApp)
		.filter((app) => app.exerciseNumber === exercise.exerciseNumber)
	const prevApp = exerciseApps[exerciseApps.length - 1]

	const articleId = `workshop-${slugify(workshopConfig.title)}-${
		exercise.exerciseNumber
	}-finished`

	return data(
		{
			articleId,
			workshopTitle: workshopConfig.title,
			exercise,
			exerciseFormEmbedUrl,
			epicVideoInfosPromise: getEpicVideoInfos(
				exercise.finishedEpicVideoEmbeds,
				{ request },
			),
			exerciseFinished: {
				file: finishedFilepath,
				relativePath: `exercises/${exercise.dirName}/FINISHED.mdx`,
			},
			prevStepLink: prevApp
				? {
						to: getAppPageRoute(prevApp),
						'aria-label': `${prevApp.title} (${prevApp.type})`,
					}
				: null,
			nextStepLink: nextExercise
				? {
						to: `/exercise/${nextExercise.exerciseNumber.toString().padStart(2, '0')}`,
						'aria-label': `${nextExercise.title}`,
					}
				: hasExtras
					? {
							to: '/extra',
							'aria-label': 'Extras',
						}
					: {
							to: '/finished',
							'aria-label': 'Finished! 🎉',
						},
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

const mdxComponents = { h1: () => null }
export default function ExerciseFinished({
	loaderData: data,
}: Route.ComponentProps) {
	const exerciseNumber = data.exercise.exerciseNumber
		.toString()
		.padStart(2, '0')

	useRevalidationWS({
		watchPaths: [`./exercises/${exerciseNumber}/FINISHED.mdx`],
	})

	return (
		<div className="flex max-w-full grow flex-col">
			<main className="flex grow flex-col sm:grid sm:h-full sm:min-h-[800px] sm:grid-cols-1 sm:grid-rows-2 md:min-h-[unset] lg:grid-cols-2 lg:grid-rows-1">
				<div className="relative flex flex-col sm:col-span-1 sm:row-span-1 sm:h-full lg:border-r">
					<h1 className="h-14 border-b pr-5 pl-10 text-sm leading-tight font-medium">
						<div className="flex h-14 flex-wrap items-center justify-between gap-x-2 py-2">
							<div className="flex items-center justify-start gap-x-2">
								<Link to={`/${exerciseNumber}`} className="hover:underline">
									{`${exerciseNumber}. ${data.exercise.title}`}
								</Link>
								<span>/</span>
								<span>Elaboration</span>
							</div>
						</div>
					</h1>

					<article
						className="shadow-on-scrollbox scrollbar-thin scrollbar-thumb-scrollbar h-full w-full max-w-none flex-1 scroll-pt-6 space-y-6 overflow-y-auto p-2 sm:p-10 sm:pt-8"
						id={data.articleId}
					>
						{data.exercise.finishedCode ? (
							<EpicVideoInfoProvider
								epicVideoInfosPromise={data.epicVideoInfosPromise}
							>
								<div className="prose dark:prose-invert sm:prose-lg">
									<Mdx
										code={data.exercise.finishedCode}
										components={mdxComponents}
									/>
								</div>
							</EpicVideoInfoProvider>
						) : (
							// TODO: render a random dad joke...
							'No finished instructions yet...'
						)}
						<RetrievalPractice exerciseNumber={data.exercise.exerciseNumber} />
					</article>
					<ElementScrollRestoration elementQuery={`#${data.articleId}`} />
					<ProgressToggle
						type="finished"
						exerciseNumber={data.exercise.exerciseNumber}
						className="h-14 border-t px-6"
					/>
					<div className="@container flex h-16 justify-between border-t border-b-4 lg:border-b-0">
						<div />
						<EditFileOnGitHub
							file={data.exerciseFinished.file}
							relativePath={data.exerciseFinished.relativePath}
						/>
						<NavChevrons prev={data.prevStepLink} next={data.nextStepLink} />
					</div>
				</div>
				<Survey
					exerciseFormEmbedUrl={data.exerciseFormEmbedUrl}
					exerciseTitle={data.exercise.title}
				/>
			</main>
		</div>
	)
}

function Survey({
	exerciseFormEmbedUrl,
	exerciseTitle,
}: {
	exerciseFormEmbedUrl: string
	exerciseTitle: string
}) {
	const theme = useTheme()
	const [iframeLoaded, setIframeLoaded] = React.useState(false)
	const isOnline = useIsOnline()
	if (!isOnline) {
		return (
			<div className="relative shrink-0">
				<div className="text-body-md text-foreground-destructive absolute inset-0 z-10 flex items-center justify-center">
					<Icon name="WifiNoConnection" size="xl">
						<span>
							{'Unable to load the '}
							<a href={exerciseFormEmbedUrl} className="underline">
								{`${exerciseTitle} feedback form`}
							</a>
							{' when offline'}
						</span>
					</Icon>
				</div>
			</div>
		)
	}
	return (
		<div className="relative min-h-full sm:min-h-[unset] sm:shrink-0">
			{!iframeLoaded ? (
				<div className="absolute inset-0 z-10 flex items-center justify-center">
					<Loading>
						<span>Loading {exerciseTitle} Elaboration form</span>
					</Loading>
				</div>
			) : null}
			<iframe
				onLoad={() => setIframeLoaded(true)}
				// show what would have shown if there is an error
				onError={() => setIframeLoaded(true)}
				title="Elaboration"
				src={exerciseFormEmbedUrl}
				className={cn(
					'absolute inset-0 flex h-full w-full transition-opacity duration-300',
					iframeLoaded ? 'opacity-100' : 'opacity-0',
				)}
				style={{ colorScheme: theme }}
			/>
		</div>
	)
}
