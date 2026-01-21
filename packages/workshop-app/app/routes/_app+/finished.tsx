import { ElementScrollRestoration } from '@epic-web/restore-scroll'
import {
	getExercises,
	getWorkshopFinished,
} from '@epic-web/workshop-utils/apps.server'
import { getWorkshopConfig } from '@epic-web/workshop-utils/config.server'
import { getEpicVideoInfos } from '@epic-web/workshop-utils/epic-api.server'
import {
	combineServerTimings,
	getServerTimeHeader,
	makeTimings,
	time,
} from '@epic-web/workshop-utils/timing.server'
import { type SEOHandle } from '@nasa-gcn/remix-seo'
import slugify from '@sindresorhus/slugify'
import * as React from 'react'
import { data, type HeadersFunction, Link } from 'react-router'
import { EpicVideoInfoProvider } from '#app/components/epic-video.tsx'
import { Icon } from '#app/components/icons.tsx'
import { Loading } from '#app/components/loading.tsx'
import { NavChevrons } from '#app/components/nav-chevrons.tsx'
import { RetrievalPractice } from '#app/components/retrieval-practice.tsx'
import { useRevalidationWS } from '#app/components/revalidation-ws.tsx'
import { Mdx } from '#app/utils/mdx.tsx'
import { cn } from '#app/utils/misc.tsx'
import { useIsOnline } from '#app/utils/online.ts'
import { getRootMatchLoaderData } from '#app/utils/root-loader.ts'
import { getSeoMetaTags } from '#app/utils/seo.ts'
import { EditFileOnGitHub } from '../launch-editor.tsx'
import { ProgressToggle } from '../progress.tsx'
import { useTheme } from '../theme/index.tsx'
import { type Route } from './+types/finished.tsx'

export const handle: SEOHandle = {
	getSitemapEntries: () => [{ route: '/finished' }],
}

export const meta: Route.MetaFunction = ({ matches }) => {
	const rootData = getRootMatchLoaderData(matches)
	if (!rootData) return []

	return getSeoMetaTags({
		title: `🎉 ${rootData?.workshopTitle}`,
		description: `Elaboration for ${rootData?.workshopTitle}`,
		ogTitle: `Finished ${rootData?.workshopTitle}`,
		ogDescription: `You finished! Time to submit feedback.`,
		instructor: rootData.instructor,
		requestInfo: rootData.requestInfo,
	})
}

export async function loader({ request }: Route.LoaderArgs) {
	const timings = makeTimings('finishedLoader')
	const exercises = await getExercises({ request, timings })
	const compiledFinished = await time(() => getWorkshopFinished({ request }), {
		timings,
		type: 'compileMdx',
		desc: 'compileMdx in finished',
	})

	const lastExercises = exercises[exercises.length - 1]
	const workshopConfig = getWorkshopConfig()
	const workshopTitle = workshopConfig.title
	const workshopFormTemplate = workshopConfig.forms.workshop
	const workshopFormEmbedUrl = workshopFormTemplate.replace(
		'{workshopTitle}',
		encodeURIComponent(workshopTitle),
	)
	return data(
		{
			articleId: `workshop-${slugify(workshopTitle)}-finished`,
			workshopTitle,
			workshopFormEmbedUrl,
			finishedCode:
				compiledFinished.compiled.status === 'success'
					? compiledFinished.compiled.code
					: null,
			epicVideoInfosPromise:
				compiledFinished.compiled.status === 'success'
					? getEpicVideoInfos(compiledFinished.compiled.epicVideoEmbeds, {
							request,
						})
					: null,
			workshopFinished: {
				status: compiledFinished.compiled.status,
				file: compiledFinished.file,
				relativePath: compiledFinished.relativePath,
			},
			prevStepLink: lastExercises
				? {
						to: `/${lastExercises.exerciseNumber}/finished`,
					}
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

const mdxComponents = { h1: () => null }

export default function ExerciseFinished({
	loaderData: data,
}: Route.ComponentProps) {
	useRevalidationWS({ watchPaths: ['./exercises/FINISHED.mdx'] })
	return (
		<div className="flex h-full grow flex-col">
			<main className="grid h-full grow grid-cols-1 grid-rows-2 lg:grid-cols-2 lg:grid-rows-1">
				<div className="relative col-span-1 row-span-1 flex h-full flex-col lg:border-r">
					<h1 className="h-14 border-b pr-5 pl-10 text-sm leading-none font-medium uppercase">
						<div className="flex h-14 flex-wrap items-center justify-between gap-x-2 py-2">
							<div className="flex items-center justify-start gap-x-2">
								<Link to="/" className="hover:underline">
									{data.workshopTitle}
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
						{data.finishedCode ? (
							<EpicVideoInfoProvider
								epicVideoInfosPromise={data.epicVideoInfosPromise}
							>
								<div className="prose dark:prose-invert sm:prose-lg">
									<Mdx code={data.finishedCode} components={mdxComponents} />
								</div>
							</EpicVideoInfoProvider>
						) : (
							// TODO: render a random dad joke...
							'No finished instructions yet...'
						)}
						<RetrievalPractice />
					</article>
					<ElementScrollRestoration elementQuery={`#${data.articleId}`} />
					<ProgressToggle
						type="workshop-finished"
						className="h-14 border-t px-6"
					/>
					<div className="@container flex h-16 justify-between border-t border-b-4 lg:border-b-0">
						<div />
						{data.workshopFinished.status === 'success' ? (
							<EditFileOnGitHub
								file={data.workshopFinished.file}
								relativePath={data.workshopFinished.relativePath}
							/>
						) : null}
						<NavChevrons prev={data.prevStepLink} next={{ to: '/' }} />
					</div>
				</div>
				<Survey
					workshopTitle={data.workshopTitle}
					workshopFormEmbedUrl={data.workshopFormEmbedUrl}
				/>
			</main>
		</div>
	)
}

function Survey({
	workshopTitle,
	workshopFormEmbedUrl,
}: {
	workshopTitle: string
	workshopFormEmbedUrl: string
}) {
	const theme = useTheme()
	const [iframeLoaded, setIframeLoaded] = React.useState(false)
	const isOnline = useIsOnline()
	if (!isOnline) {
		return (
			<div className="relative shrink-0">
				<div className="text-foreground-destructive absolute inset-0 z-10 flex items-center justify-center">
					<Icon name="WifiNoConnection" size="xl">
						<span>
							{'Unable to load the '}
							<a href={workshopFormEmbedUrl} className="underline">
								{`${workshopTitle} feedback form`}
							</a>
							{' when offline'}
						</span>
					</Icon>
				</div>
			</div>
		)
	}
	return (
		<div className="relative shrink-0">
			{!iframeLoaded ? (
				<div className="absolute inset-0 z-10 flex items-center justify-center">
					<Loading>
						<span>Loading {workshopTitle} Elaboration form</span>
					</Loading>
				</div>
			) : null}
			<iframe
				onLoad={() => setIframeLoaded(true)}
				// show what would have shown if there is an error
				onError={() => setIframeLoaded(true)}
				title="Elaboration"
				src={workshopFormEmbedUrl}
				className={cn(
					'absolute inset-0 flex h-full w-full transition-opacity duration-300',
					iframeLoaded ? 'opacity-100' : 'opacity-0',
				)}
				style={{ colorScheme: theme }}
			/>
		</div>
	)
}
