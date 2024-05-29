import path from 'path'
import { invariantResponse } from '@epic-web/invariant'
import { ElementScrollRestoration } from '@epic-web/restore-scroll'
import {
	getAppPageRoute,
	getApps,
	getExercise,
	getWorkshopRoot,
	getWorkshopTitle,
	isExerciseStepApp,
} from '@epic-web/workshop-utils/apps.server'
import {
	combineServerTimings,
	getServerTimeHeader,
	makeTimings,
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
import { EditFileOnGitHub } from '#app/routes/launch-editor.tsx'
import { ProgressToggle } from '#app/routes/progress.tsx'
import { getEpicVideoInfos } from '#app/utils/epic-api.ts'
import { Mdx } from '#app/utils/mdx.tsx'
import { cn } from '#app/utils/misc.tsx'

export const meta: MetaFunction<typeof loader, { root: typeof rootLoader }> = ({
	data,
	matches,
}) => {
	if (!data) {
		return [{ title: '🦉 | Error' }]
	}
	const number = data.exercise.exerciseNumber.toString().padStart(2, '0')

	const rootData = matches.find(m => m.id === 'root')?.data
	return [
		{
			title: `🦉 | ${number}. ${data.exercise.title} | ${rootData?.workshopTitle}`,
		},
	]
}

export async function loader({ request, params }: LoaderFunctionArgs) {
	const timings = makeTimings('exerciseFinishedLoader')
	invariantResponse(params.exerciseNumber, 'exerciseNumber is required')
	const exercise = await getExercise(params.exerciseNumber, {
		timings,
		request,
	})
	if (!exercise) {
		throw new Response('Not found', { status: 404 })
	}
	const workshopTitle = await getWorkshopTitle()
	const workshopRoot = getWorkshopRoot()
	const exerciseFormTemplate = await getPkgProp(
		workshopRoot,
		'epicshop.forms.exercise',
		`https://docs.google.com/forms/d/e/1FAIpQLSf3o9xyjQepTlOTH5Z7ZwkeSTdXh6YWI_RGc9KiyD3oUN0p6w/viewform?hl=en&embedded=true&entry.1836176234={workshopTitle}&entry.428900931={exerciseTitle}`,
	)
	const exerciseFormEmbedUrl = exerciseFormTemplate
		.replace('{workshopTitle}', encodeURIComponent(workshopTitle))
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
	const exerciseApps = apps
		.filter(isExerciseStepApp)
		.filter(app => app.exerciseNumber === exercise.exerciseNumber)
	const prevApp = exerciseApps[exerciseApps.length - 1]

	const articleId = `workshop-${slugify(workshopTitle)}-${
		exercise.exerciseNumber
	}-finished`

	return defer(
		{
			articleId,
			workshopTitle,
			exercise,
			exerciseFormEmbedUrl,
			epicVideoInfosPromise: getEpicVideoInfos(
				exercise.finishedEpicVideoEmbeds,
				{ request },
			),
			exerciseFinished: exercise.finishedCode
				? {
						file: finishedFilepath,
						relativePath: `exercises/${exercise.dirName}/FINISHED.mdx`,
					}
				: null,
			prevStepLink: prevApp
				? {
						to: getAppPageRoute(prevApp),
						'aria-label': `${prevApp.title} (${prevApp.type})`,
					}
				: null,
			nextStepLink: nextExercise
				? {
						to: `/${nextExercise.exerciseNumber.toString().padStart(2, '0')}`,
						'aria-label': `${nextExercise.title}`,
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
export default function ExerciseFinished() {
	const data = useLoaderData<typeof loader>()
	const exerciseNumber = data.exercise.exerciseNumber
		.toString()
		.padStart(2, '0')

	return (
		<div className="flex flex-grow flex-col">
			<main className="grid h-full flex-grow grid-cols-1 grid-rows-2 lg:grid-cols-2 lg:grid-rows-1">
				<div className="relative col-span-1 row-span-1 flex h-full flex-col lg:border-r">
					<h1 className="h-14 border-b pl-10 pr-5 text-sm font-medium uppercase leading-none">
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
						className="shadow-on-scrollbox h-full w-full max-w-none flex-1 scroll-pt-6 space-y-6 overflow-y-auto p-10 pt-8 scrollbar-thin scrollbar-thumb-scrollbar"
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
					</article>
					<ElementScrollRestoration elementQuery={`#${data.articleId}`} />
					<ProgressToggle
						type="finished"
						exerciseNumber={data.exercise.exerciseNumber}
						className="h-14 border-t px-6"
					/>
					<div className="flex h-16 justify-between border-b-4 border-t lg:border-b-0">
						<div />
						{data.exerciseFinished ? (
							<EditFileOnGitHub
								file={data.exerciseFinished.file}
								relativePath={data.exerciseFinished.relativePath}
							/>
						) : null}
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
	const [iframeLoaded, setIframeLoaded] = React.useState(false)
	return (
		<div className="relative flex-shrink-0">
			{!iframeLoaded ? (
				<div className="absolute inset-0 z-10 flex items-center justify-center">
					<Loading>
						<span>Loading {exerciseTitle} Elaboration form</span>
					</Loading>
				</div>
			) : null}
			<iframe
				onLoad={() => setIframeLoaded(true)}
				title="Elaboration"
				src={exerciseFormEmbedUrl}
				className={cn(
					'absolute inset-0 flex h-full w-full transition-opacity duration-300',
					iframeLoaded ? 'opacity-100' : 'opacity-0',
				)}
			/>
		</div>
	)
}
