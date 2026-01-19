import { ElementScrollRestoration } from '@epic-web/restore-scroll'
import {
	getAppDisplayName,
	getAppPageRoute,
	getApps,
	getExerciseApp,
	getNextExerciseApp,
	getPrevExerciseApp,
	isExerciseStepApp,
	isPlaygroundApp,
	requireExercise,
	requireExerciseApp,
	type App,
	type ExerciseStepApp,
} from '@epic-web/workshop-utils/apps.server'
import { getWorkshopConfig } from '@epic-web/workshop-utils/config.server'
import { getDiffFiles } from '@epic-web/workshop-utils/diff.server'
import { getEpicVideoInfos } from '@epic-web/workshop-utils/epic-api.server'
import {
	combineServerTimings,
	getServerTimeHeader,
	makeTimings,
} from '@epic-web/workshop-utils/timing.server'
import slugify from '@sindresorhus/slugify'
import { useRef, useState } from 'react'
import {
	Link,
	Outlet,
	data,
	redirect,
	type HeadersFunction,
} from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { type InBrowserBrowserRef } from '#app/components/in-browser-browser.tsx'
import { NavChevrons } from '#app/components/nav-chevrons.tsx'
import { useRevalidationWS } from '#app/components/revalidation-ws.tsx'
import { EditFileOnGitHub } from '#app/routes/launch-editor.tsx'
import { ProgressToggle } from '#app/routes/progress.tsx'
import { SetAppToPlayground } from '#app/routes/set-playground.tsx'
import { getExercisePath } from '#app/utils/misc.tsx'
import { getRootMatchLoaderData } from '#app/utils/root-loader.ts'
import { getSeoMetaTags } from '#app/utils/seo.ts'
import {
	getSplitPercentFromRequest,
	setSplitPercentCookie,
	startSplitDrag,
} from '#app/utils/split-layout.ts'
import { getStep404Data } from '../__shared/error-boundary.server.ts'
import { Exercise404ErrorBoundary } from '../__shared/error-boundary.tsx'
import { type Route } from './+types/_layout.tsx'
import { StepMdx } from './__shared/step-mdx.tsx'
import TouchedFiles from './__shared/touched-files.tsx'

function pageTitle(
	data: Awaited<Route.ComponentProps['loaderData']> | undefined,
	workshopTitle?: string,
) {
	const exerciseNumber =
		data?.exerciseStepApp.exerciseNumber.toString().padStart(2, '0') ?? '00'
	const stepNumber =
		data?.exerciseStepApp.stepNumber.toString().padStart(2, '0') ?? '00'
	const emoji = (
		{
			problem: '💪',
			solution: '🏁',
		} as const
	)[data?.type ?? 'problem']
	const title = data?.[data.type]?.title ?? 'N/A'
	return {
		emoji,
		stepNumber,
		title,
		exerciseNumber,
		exerciseTitle: data?.exerciseTitle ?? 'Unknown exercise',
		workshopTitle,
		type: data?.type ?? 'problem',
	}
}

export const meta: Route.MetaFunction = ({ loaderData, matches, params }) => {
	const rootData = getRootMatchLoaderData(matches)
	if (!loaderData || !rootData) return [{ title: '🦉 | Error' }]
	const { emoji, stepNumber, title, exerciseNumber, exerciseTitle } =
		pageTitle(loaderData)

	return getSeoMetaTags({
		title: `${emoji} | ${stepNumber}. ${title} | ${exerciseNumber}. ${exerciseTitle} | ${rootData.workshopTitle}`,
		description: `${params.type} step for exercise ${exerciseNumber}. ${exerciseTitle}`,
		ogTitle: title,
		ogDescription: `${exerciseTitle} step ${Number(stepNumber)} ${params.type}`,
		instructor: rootData.instructor,
		requestInfo: rootData.requestInfo,
	})
}

export async function loader({ request, params }: Route.LoaderArgs) {
	const timings = makeTimings('exerciseStepTypeLayoutLoader')
	const url = new URL(request.url)
	const { type } = params
	const { title: workshopTitle } = getWorkshopConfig()

	const cacheOptions = { request, timings }

	const [allAppsFull, problemApp, solutionApp] = await Promise.all([
		getApps(cacheOptions),
		getExerciseApp({ ...params, type: 'problem' }, cacheOptions),
		getExerciseApp({ ...params, type: 'solution' }, cacheOptions),
	])

	const reqUrl = new URL(request.url)
	const pathnameParam = reqUrl.searchParams.get('pathname')
	if (pathnameParam === '' || pathnameParam === '/') {
		reqUrl.searchParams.delete('pathname')
		throw redirect(reqUrl.toString())
	}

	if (
		(type === 'problem' && !problemApp) ||
		(type === 'solution' && !solutionApp)
	) {
		const errorData = await getStep404Data({
			exerciseNumber: params.exerciseNumber,
		})
		throw Response.json(errorData, { status: 404 })
	}

	const exerciseStepApp = await requireExerciseApp(params, cacheOptions)

	const playgroundApp = allAppsFull.find(isPlaygroundApp)

	function getStepId(a: ExerciseStepApp) {
		return (
			a.exerciseNumber * 1000 +
			a.stepNumber * 10 +
			(a.type === 'problem' ? 0 : 1)
		)
	}

	function getStepNameAndId(a: App) {
		if (isExerciseStepApp(a)) {
			const exerciseNumberStr = String(a.exerciseNumber).padStart(2, '0')
			const stepNumberStr = String(a.stepNumber).padStart(2, '0')

			return {
				stepName: `${exerciseNumberStr}/${stepNumberStr}.${a.type}`,
				stepId: getStepId(a),
			}
		}
		return { stepName: '', stepId: -1 }
	}

	const allApps = allAppsFull
		.filter((a, i, ar) => ar.findIndex((b) => a.name === b.name) === i)
		.map((a) => ({
			displayName: getAppDisplayName(a, allAppsFull),
			name: a.name,
			title: a.title,
			type: a.type,
			...getStepNameAndId(a),
		}))

	allApps.sort((a, b) => {
		// order them by their stepId
		if (a.stepId > 0 && b.stepId > 0) return a.stepId - b.stepId

		// non-step apps should come after step apps
		if (a.stepId > 0) return -1
		if (b.stepId > 0) return 1

		return 0
	})
	const exerciseId = getStepId(exerciseStepApp)
	const exerciseIndex = allApps.findIndex((step) => step.stepId === exerciseId)

	// These depend on exerciseStepApp
	const [exercise, nextApp, prevApp] = await Promise.all([
		requireExercise(exerciseStepApp.exerciseNumber, cacheOptions),
		getNextExerciseApp(exerciseStepApp, cacheOptions),
		getPrevExerciseApp(exerciseStepApp, cacheOptions),
	])

	const exerciseApps = allAppsFull
		.filter(isExerciseStepApp)
		.filter((app) => app.exerciseNumber === exerciseStepApp.exerciseNumber)
	const isLastStep =
		exerciseApps[exerciseApps.length - 1]?.name === exerciseStepApp.name
	const isFirstStep = exerciseApps[0]?.name === exerciseStepApp.name

	const articleId = `workshop-${slugify(workshopTitle)}-${
		exercise.exerciseNumber
	}-${exerciseStepApp.stepNumber}-${exerciseStepApp.type}`

	const subroute = url.pathname.split(
		`/exercise/${params.exerciseNumber}/${params.stepNumber}/${params.type}/`,
	)[1]

	// read persisted split percentage from cookie (10-90, default 50)
	const splitPercent = getSplitPercentFromRequest(request, 50)

	return data(
		{
			articleId,
			type: params.type as 'problem' | 'solution',
			exerciseStepApp,
			exerciseTitle: exercise.title,
			epicVideoInfosPromise: getEpicVideoInfos(exerciseStepApp.epicVideoEmbeds),
			exerciseIndex,
			allApps,
			splitPercent,
			prevStepLink: isFirstStep
				? {
						to: `/exercise/${exerciseStepApp.exerciseNumber
							.toString()
							.padStart(2, '0')}`,
					}
				: prevApp
					? {
							to: getAppPageRoute(prevApp, {
								subroute,
								searchParams: url.searchParams,
							}),
						}
					: null,
			nextStepLink: isLastStep
				? {
						to: `/exercise/${exerciseStepApp.exerciseNumber
							.toString()
							.padStart(2, '0')}/finished`,
					}
				: nextApp
					? {
							to: getAppPageRoute(nextApp, {
								subroute,
								searchParams: url.searchParams,
							}),
						}
					: null,
			playground: playgroundApp
				? ({
						type: 'playground',
						appName: playgroundApp.appName,
						name: playgroundApp.name,
						fullPath: playgroundApp.fullPath,
						dev: playgroundApp.dev,
						isUpToDate: playgroundApp.isUpToDate,
					} as const)
				: null,
			problem: problemApp
				? ({
						type: 'problem',
						title: problemApp.title,
						name: problemApp.name,
						fullPath: problemApp.fullPath,
						dev: problemApp.dev,
					} as const)
				: null,
			solution: solutionApp
				? ({
						type: 'solution',
						title: solutionApp.title,
						name: solutionApp.name,
						fullPath: solutionApp.fullPath,
						dev: solutionApp.dev,
					} as const)
				: null,
			diffFiles:
				problemApp && solutionApp
					? getDiffFiles(problemApp, solutionApp, {
							...cacheOptions,
							forceFresh: url.searchParams.get('forceFresh') === 'diff',
						}).catch((e) => {
							console.error(e)
							return 'There was a problem generating the diff (check the terminal output)'
						})
					: 'No diff available',
		} as const,
		{
			headers: {
				'Server-Timing': getServerTimeHeader(timings),
			},
		},
	)
}

export const headers: HeadersFunction = ({ loaderHeaders, parentHeaders }) => {
	const headers = {
		'Server-Timing': combineServerTimings(loaderHeaders, parentHeaders),
	}
	return headers
}

export default function ExercisePartRoute({
	loaderData: data,
}: Route.ComponentProps) {
	const inBrowserBrowserRef = useRef<InBrowserBrowserRef>(null)
	const containerRef = useRef<HTMLDivElement>(null)
	const leftPaneRef = useRef<HTMLDivElement>(null)
	const [splitPercent, setSplitPercent] = useState<number>(data.splitPercent)

	const titleBits = pageTitle(data)

	useRevalidationWS({
		watchPaths: [`${data.exerciseStepApp.relativePath}/README.mdx`],
	})

	const showPlaygroundIndicator = data.problem
		? data.playground?.appName !== data.problem.name
		: false

	return (
		<div className="flex max-w-full grow flex-col">
			<main
				ref={containerRef}
				className="flex grow flex-col overflow-y-auto sm:h-full sm:min-h-[800px] md:min-h-[unset] lg:flex-row lg:overflow-y-hidden"
			>
				<div
					className="relative flex min-w-0 flex-none basis-auto flex-col sm:col-span-1 sm:row-span-1 lg:h-full lg:basis-(--split-pct)"
					style={{ ['--split-pct' as any]: `${splitPercent}%` }}
					ref={leftPaneRef}
				>
					<h1 className="@container h-14 border-b pr-5 pl-10 text-sm leading-tight font-medium">
						<div className="flex h-14 items-center justify-between gap-x-2 py-2 whitespace-nowrap">
							<div className="flex items-center justify-start gap-x-2 uppercase">
								<Link
									to={getExercisePath(data.exerciseStepApp.exerciseNumber)}
									className="hover:underline"
								>
									<span>{titleBits.exerciseNumber}.</span>
									<span className="hidden @min-[500px]:inline">
										{' '}
										{titleBits.exerciseTitle}
									</span>
								</Link>
								<span>/</span>
								<Link to="." className="hover:underline">
									<span>{titleBits.stepNumber}.</span>
									<span className="hidden @min-[300px]:inline">
										{' '}
										{titleBits.title}
									</span>
									<span> ({titleBits.emoji}</span>
									<span className="hidden @min-[400px]:inline">
										{' '}
										{titleBits.type}
									</span>
									<span>)</span>
								</Link>
							</div>
							{data.problem &&
							(data.playground?.appName !== data.problem.name ||
								!data.playground?.isUpToDate) ? (
								<SetAppToPlayground
									appName={data.problem.name}
									isOutdated={data.playground?.isUpToDate === false}
									hideTextOnNarrow
									showOnboardingIndicator={showPlaygroundIndicator}
								/>
							) : null}
						</div>
					</h1>
					<article
						id={data.articleId}
						key={data.articleId}
						className="shadow-on-scrollbox scrollbar-thin scrollbar-thumb-scrollbar flex w-full max-w-none scroll-pt-6 flex-col justify-between space-y-6 p-2 sm:p-10 sm:pt-8 lg:h-full lg:flex-1 lg:overflow-y-auto"
					>
						{data.exerciseStepApp.instructionsCode ? (
							<StepMdx inBrowserBrowserRef={inBrowserBrowserRef} />
						) : (
							<div className="flex h-full items-center justify-center text-lg">
								<p>No instructions yet...</p>
							</div>
						)}
						<div className="mt-auto flex justify-between">
							{data.prevStepLink ? (
								<Link
									to={data.prevStepLink.to}
									aria-label="Previous Step"
									data-keyboard-action="g+p"
									prefetch="intent"
								>
									<span aria-hidden>←</span>
									<span className="hidden xl:inline"> Previous</span>
								</Link>
							) : (
								<span />
							)}
							{data.nextStepLink ? (
								<Link
									to={data.nextStepLink.to}
									aria-label="Next Step"
									data-keyboard-action="g+n"
									prefetch="intent"
								>
									<span className="hidden xl:inline">Next </span>
									<span aria-hidden>→</span>
								</Link>
							) : (
								<span />
							)}
						</div>
					</article>
					<ElementScrollRestoration
						elementQuery={`#${data.articleId}`}
						key={`scroll-${data.articleId}`}
					/>
					{data.type === 'solution' ? (
						<ProgressToggle
							type="step"
							exerciseNumber={data.exerciseStepApp.exerciseNumber}
							stepNumber={data.exerciseStepApp.stepNumber}
							className="h-14 border-t px-6"
						/>
					) : null}
					<div className="@container flex h-16 justify-between border-t border-b-4 lg:border-b-0">
						<div>
							<div className="h-full">
								<TouchedFiles diffFilesPromise={data.diffFiles} />
							</div>
						</div>
						<EditFileOnGitHub
							appName={data.exerciseStepApp.name}
							relativePath={`${data.exerciseStepApp.relativePath}/README.mdx`}
						/>
						<NavChevrons
							prev={
								data.prevStepLink
									? {
											to: data.prevStepLink.to,
											'aria-label': 'Previous Step',
										}
									: null
							}
							next={
								data.nextStepLink
									? {
											to: data.nextStepLink.to,
											'aria-label': 'Next Step',
										}
									: null
							}
						/>
					</div>
				</div>
				<div
					role="separator"
					aria-orientation="vertical"
					title="Drag to resize"
					className="bg-border hover:bg-accent hidden w-1 cursor-col-resize lg:block"
					onMouseDown={(event) =>
						startSplitDrag({
							container: containerRef.current,
							initialClientX: event.clientX,
							setSplitPercent,
						})
					}
					onDoubleClick={() => {
						setSplitPercent(setSplitPercentCookie(50))
					}}
					onTouchStart={(event) => {
						const firstTouch = event.touches?.[0]
						if (!firstTouch) return
						startSplitDrag({
							container: containerRef.current,
							initialClientX: firstTouch.clientX,
							setSplitPercent,
						})
					}}
				/>
				<div className="flex min-h-[50vh] min-w-0 flex-none lg:min-h-0 lg:flex-1">
					<Outlet context={{ inBrowserBrowserRef }} />
				</div>
			</main>
		</div>
	)
}

export function ErrorBoundary() {
	return (
		<GeneralErrorBoundary
			className="container flex items-center justify-center"
			statusHandlers={{
				404: Exercise404ErrorBoundary,
			}}
		/>
	)
}
