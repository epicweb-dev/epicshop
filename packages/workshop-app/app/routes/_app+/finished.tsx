import { ElementScrollRestoration } from '@epic-web/restore-scroll'
import {
	getExercises,
	getWorkshopFinished,
	getWorkshopRoot,
	getWorkshopTitle,
} from '@epic-web/workshop-utils/apps.server'
import {
	combineServerTimings,
	getServerTimeHeader,
	makeTimings,
	time,
} from '@epic-web/workshop-utils/timing.server'
import { getPkgProp } from '@epic-web/workshop-utils/utils.server'
import {
	defer,
	type HeadersFunction,
	type LoaderFunctionArgs,
	type MetaFunction,
} from '@remix-run/node'
import { Link, useLoaderData } from '@remix-run/react'
import slugify from '@sindresorhus/slugify'
import * as React from 'react'
import { EpicVideoInfoProvider } from '#app/components/epic-video.tsx'
import { Loading } from '#app/components/loading.tsx'
import { NavChevrons } from '#app/components/nav-chevrons.tsx'
import { type loader as rootLoader } from '#app/root.tsx'
import { getEpicVideoInfos } from '#app/utils/epic-api.ts'
import { Mdx } from '#app/utils/mdx.tsx'
import { cn } from '#app/utils/misc.tsx'
import { getSeoMetaTags } from '#app/utils/seo.js'
import { EditFileOnGitHub } from '../launch-editor.tsx'
import { ProgressToggle } from '../progress.tsx'

export const meta: MetaFunction<typeof loader, { root: typeof rootLoader }> = ({
	matches,
}) => {
	const rootData = matches.find((m) => m.id === 'root')?.data
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

export async function loader({ request }: LoaderFunctionArgs) {
	const timings = makeTimings('finishedLoader')
	const exercises = await getExercises({ request, timings })
	const compiledFinished = await time(() => getWorkshopFinished({ request }), {
		timings,
		type: 'compileMdx',
		desc: 'compileMdx in finished',
	})

	const lastExercises = exercises[exercises.length - 1]
	const workshopTitle = await getWorkshopTitle()
	const workshopRoot = getWorkshopRoot()
	const workshopFormTemplate = await getPkgProp(
		workshopRoot,
		'epicshop.forms.workshop',
		'https://docs.google.com/forms/d/e/1FAIpQLSdRmj9p8-5zyoqRzxp3UpqSbC3aFkweXvvJIKes0a5s894gzg/viewform?hl=en&embedded=true&entry.2123647600={workshopTitle}',
	)
	const workshopFormEmbedUrl = workshopFormTemplate.replace(
		'{workshopTitle}',
		encodeURIComponent(workshopTitle),
	)
	return defer(
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

export default function ExerciseFinished() {
	const data = useLoaderData<typeof loader>()
	return (
		<div className="flex h-full flex-grow flex-col">
			<main className="grid h-full flex-grow grid-cols-1 grid-rows-2 lg:grid-cols-2 lg:grid-rows-1">
				<div className="relative col-span-1 row-span-1 flex h-full flex-col lg:border-r">
					<h1 className="h-14 border-b pl-10 pr-5 text-sm font-medium uppercase leading-none">
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
						className="shadow-on-scrollbox h-full w-full max-w-none flex-1 scroll-pt-6 space-y-6 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-scrollbar sm:p-10 sm:pt-8"
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
					</article>
					<ElementScrollRestoration elementQuery={`#${data.articleId}`} />
					<ProgressToggle
						type="workshop-finished"
						className="h-14 border-t px-6"
					/>
					<div className="flex h-16 justify-between border-b-4 border-t lg:border-b-0">
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
	const [iframeLoaded, setIframeLoaded] = React.useState(false)
	return (
		<div className="relative flex-shrink-0">
			{!iframeLoaded ? (
				<div className="absolute inset-0 z-10 flex items-center justify-center">
					<Loading>
						<span>Loading {workshopTitle} Elaboration form</span>
					</Loading>
				</div>
			) : null}
			<iframe
				onLoad={() => setIframeLoaded(true)}
				title="Elaboration"
				src={workshopFormEmbedUrl}
				className={cn(
					'absolute inset-0 flex h-full w-full transition-opacity duration-300',
					iframeLoaded ? 'opacity-100' : 'opacity-0',
				)}
			/>
		</div>
	)
}
