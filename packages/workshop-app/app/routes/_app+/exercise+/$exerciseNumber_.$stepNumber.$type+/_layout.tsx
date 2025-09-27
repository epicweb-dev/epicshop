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
import * as cookie from 'cookie'
import { useEffect, useRef, useState } from 'react'
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
import { useRevalidationWS } from '#app/components/revalidation-ws.js'
import { type RootLoaderData } from '#app/root.tsx'
import { EditFileOnGitHub } from '#app/routes/launch-editor.tsx'
import { ProgressToggle } from '#app/routes/progress.tsx'
import { SetAppToPlayground } from '#app/routes/set-playground.tsx'
import { getExercisePath } from '#app/utils/misc.tsx'
import { getSeoMetaTags } from '#app/utils/seo.js'
import { getStep404Data } from '../__shared/error-boundary.server.ts'
import { Exercise404ErrorBoundary } from '../__shared/error-boundary.tsx'
import { type Route } from './+types/_layout.tsx'
import { StepMdx } from './__shared/step-mdx.tsx'
import TouchedFiles from './__shared/touched-files.tsx'

// shared split state helpers
const splitCookieName = 'es_split_pct'

function computeSplitPercent(input: unknown, defaultValue = 50): number {
	const value = typeof input === 'number' ? input : Number(input)
	if (Number.isFinite(value)) {
		return Math.min(80, Math.max(20, Math.round(value * 100) / 100))
	}
	return defaultValue
}

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

export const meta: Route.MetaFunction = ({ data, matches, params }) => {
	const rootData = matches.find((m) => m?.id === 'root')?.data as RootLoaderData
	if (!data || !rootData) return [{ title: '🦉 | Error' }]
	const { emoji, stepNumber, title, exerciseNumber, exerciseTitle } =
		pageTitle(data)

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
	const cookieHeader = request.headers.get('cookie')
	const rawSplit = cookieHeader
		? cookie.parse(cookieHeader)[splitCookieName]
		: null
	const splitPercent = computeSplitPercent(rawSplit, 50)

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
	const [leftWidthPx, setLeftWidthPx] = useState<number>(0)

	useEffect(() => {
		const left = leftPaneRef.current
		if (!left) return
		const ro = new ResizeObserver((entries) => {
			for (const entry of entries) {
				setLeftWidthPx(entry.contentRect.width)
			}
		})
		ro.observe(left)
		setLeftWidthPx(left.getBoundingClientRect().width)
		return () => ro.disconnect()
	}, [])

	function setCookie(percent: number) {
		const clamped = computeSplitPercent(percent)
		document.cookie = `${splitCookieName}=${clamped}; path=/; SameSite=Lax;`
	}

	function startDrag(initialClientX: number) {
		const container = containerRef.current
		if (!container) return
		const rect = container.getBoundingClientRect()
		let dragging = true

		// Disable pointer events on iframes so the drag keeps receiving events
		const iframes = Array.from(
			document.querySelectorAll('iframe'),
		) as HTMLIFrameElement[]
		const originalPointerEvents = iframes.map((el) => el.style.pointerEvents)
		iframes.forEach((el) => (el.style.pointerEvents = 'none'))

		function handleMove(clientX: number) {
			// Safety check: ensure user is still dragging
			if (!dragging) {
				cleanup()
				return
			}

			const relativeX = clientX - rect.left
			const percent = (relativeX / rect.width) * 100
			const clamped = computeSplitPercent(percent)
			setSplitPercent(clamped)
			setCookie(clamped)
		}

		function onMouseMove(e: MouseEvent) {
			if (!dragging || e.buttons === 0) {
				cleanup()
				return
			}
			handleMove(e.clientX)
		}
		function onTouchMove(e: TouchEvent) {
			const firstTouch = e.touches?.[0]
			if (!dragging || !firstTouch) {
				cleanup()
				return
			}
			handleMove(firstTouch.clientX)
		}
		function cleanup() {
			if (!dragging) return
			dragging = false
			iframes.forEach(
				(el, i) => (el.style.pointerEvents = originalPointerEvents[i] ?? ''),
			)
			window.removeEventListener('mousemove', onMouseMove)
			window.removeEventListener('mouseup', cleanup)
			window.removeEventListener('touchmove', onTouchMove)
			window.removeEventListener('touchend', cleanup)
			document.body.style.cursor = ''
			document.body.style.userSelect = ''
		}

		window.addEventListener('mousemove', onMouseMove)
		window.addEventListener('mouseup', cleanup)
		window.addEventListener('touchmove', onTouchMove)
		window.addEventListener('touchend', cleanup)
		document.body.style.cursor = 'col-resize'
		document.body.style.userSelect = 'none'
		handleMove(initialClientX)
	}

	const titleBits = pageTitle(data)

	useRevalidationWS({
		watchPaths: [`${data.exerciseStepApp.relativePath}/README.mdx`],
	})

	return (
		<div className="flex max-w-full flex-grow flex-col">
			<main
				ref={containerRef}
				className="flex flex-grow flex-col sm:h-full sm:min-h-[800px] md:min-h-[unset] lg:flex-row"
			>
				<div
					className="relative flex min-w-0 flex-none basis-full flex-col sm:col-span-1 sm:row-span-1 sm:h-full lg:basis-[var(--split-pct)]"
					style={{ ['--split-pct' as any]: `${splitPercent}%` }}
					ref={leftPaneRef}
				>
					<h1 className="h-14 border-b pl-10 pr-5 text-sm font-medium leading-tight">
						<div className="flex h-14 items-center justify-between gap-x-2 overflow-x-auto whitespace-nowrap py-2">
							<div className="flex items-center justify-start gap-x-2 uppercase">
								<Link
									to={getExercisePath(data.exerciseStepApp.exerciseNumber)}
									className="hover:underline"
								>
									{titleBits.exerciseNumber}. {titleBits.exerciseTitle}
								</Link>
								{'/'}
								<Link to="." className="hover:underline">
									{titleBits.stepNumber}. {titleBits.title}
									{' ('}
									{titleBits.emoji} {titleBits.type}
									{')'}
								</Link>
							</div>
							{data.problem &&
							(data.playground?.appName !== data.problem.name ||
								!data.playground?.isUpToDate) ? (
								<div className="hidden md:block">
									<SetAppToPlayground
										appName={data.problem.name}
										isOutdated={data.playground?.isUpToDate === false}
									/>
								</div>
							) : null}
						</div>
					</h1>
					<article
						id={data.articleId}
						key={data.articleId}
						className="shadow-on-scrollbox flex h-full w-full max-w-none flex-1 scroll-pt-6 flex-col justify-between space-y-6 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-scrollbar sm:p-10 sm:pt-8"
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
					<div className="flex h-16 justify-between border-b-4 border-t lg:border-b-0">
						<div>
							<div className="h-full">
								<TouchedFiles
									diffFilesPromise={data.diffFiles}
									compact={leftWidthPx < 640}
								/>
							</div>
						</div>
						<EditFileOnGitHub
							appName={data.exerciseStepApp.name}
							relativePath={`${data.exerciseStepApp.relativePath}/README.mdx`}
							compact={leftWidthPx < 720}
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
					className="hidden w-1 cursor-col-resize bg-border hover:bg-accent lg:block"
					onMouseDown={(e) => startDrag(e.clientX)}
					onDoubleClick={() => {
						setSplitPercent(50)
						setCookie(50)
					}}
					onTouchStart={(e) => {
						const firstTouch = e.touches?.[0]
						if (firstTouch) startDrag(firstTouch.clientX)
					}}
				/>
				<div className="flex min-w-0 flex-1">
					<Outlet />
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
