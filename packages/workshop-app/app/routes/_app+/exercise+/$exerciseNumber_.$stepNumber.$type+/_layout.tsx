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
	data,
	redirect,
	type HeadersFunction,
	Link,
	Outlet,
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
	const { title: workshopTitle } = getWorkshopConfig()

	const cacheOptions = { request, timings }

	const [exerciseStepApp, allAppsFull, problemApp, solutionApp] =
		await Promise.all([
			requireExerciseApp(params, cacheOptions),
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

	if (!problemApp && !solutionApp) {
		throw new Response('Not found', { status: 404 })
	}

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
		let lastKnownX = initialClientX

		// Create a global overlay to capture all mouse events during drag
		const overlay = document.createElement('div')
		overlay.style.position = 'fixed'
		overlay.style.top = '0'
		overlay.style.left = '0'
		overlay.style.width = '100vw'
		overlay.style.height = '100vh'
		overlay.style.zIndex = '9999'
		overlay.style.cursor = 'col-resize'
		overlay.style.pointerEvents = 'auto'
		overlay.style.backgroundColor = 'transparent'
		// Add a subtle visual indicator that dragging is active
		overlay.style.border = '2px dashed rgba(59, 130, 246, 0.3)'
		overlay.style.boxSizing = 'border-box'
		// Add a subtle background to make it clear the overlay is active
		overlay.style.background = 'linear-gradient(90deg, rgba(59, 130, 246, 0.02) 0%, rgba(59, 130, 246, 0.02) 100%)'
		
		// Add a split percentage indicator
		const indicator = document.createElement('div')
		indicator.style.position = 'fixed'
		indicator.style.top = '20px'
		indicator.style.right = '20px'
		indicator.style.padding = '8px 12px'
		indicator.style.backgroundColor = 'rgba(0, 0, 0, 0.8)'
		indicator.style.color = 'white'
		indicator.style.borderRadius = '6px'
		indicator.style.fontSize = '14px'
		indicator.style.fontWeight = '500'
		indicator.style.zIndex = '10000'
		indicator.style.pointerEvents = 'none'
		indicator.textContent = `${Math.round(splitPercent)}%`
		document.body.appendChild(indicator)
		
		// Add a message to inform users they can press Escape to cancel
		const helpText = document.createElement('div')
		helpText.style.position = 'fixed'
		helpText.style.bottom = '20px'
		helpText.style.left = '50%'
		helpText.style.transform = 'translateX(-50%)'
		helpText.style.padding = '8px 16px'
		helpText.style.backgroundColor = 'rgba(0, 0, 0, 0.7)'
		helpText.style.color = 'white'
		helpText.style.borderRadius = '6px'
		helpText.style.fontSize = '12px'
		helpText.style.zIndex = '10000'
		helpText.style.pointerEvents = 'none'
		helpText.textContent = 'Press Escape to cancel dragging'
		document.body.appendChild(helpText)
		
		// Add a visual indicator for the current drag position
		const dragLine = document.createElement('div')
		dragLine.style.position = 'fixed'
		dragLine.style.top = '0'
		dragLine.style.bottom = '0'
		dragLine.style.width = '2px'
		dragLine.style.backgroundColor = 'rgba(59, 130, 246, 0.8)'
		dragLine.style.zIndex = '9998'
		dragLine.style.pointerEvents = 'none'
		dragLine.style.transition = 'left 0.05s ease-out'
		// Position the drag line at the initial split position
		const initialLeft = (splitPercent / 100) * rect.width
		dragLine.style.left = `${initialLeft}px`
		document.body.appendChild(dragLine)
		
		// Add a subtle animation to the overlay to indicate it's active
		overlay.style.animation = 'pulse 2s ease-in-out infinite'
		overlay.style.animationDelay = '0.5s'
		
		// Add CSS animation for the pulse effect
		if (!document.getElementById('drag-pulse-animation')) {
			const style = document.createElement('style')
			style.id = 'drag-pulse-animation'
			style.textContent = `
				@keyframes pulse {
					0%, 100% { opacity: 0.3; }
					50% { opacity: 0.6; }
				}
			`
			document.head.appendChild(style)
		}
		
		// Add a subtle shadow to the drag line for better visibility
		dragLine.style.boxShadow = '0 0 8px rgba(59, 130, 246, 0.4)'
		
		// Add a subtle glow effect to the overlay
		overlay.style.boxShadow = 'inset 0 0 20px rgba(59, 130, 246, 0.1)'

		document.body.appendChild(overlay)

		// Add event listeners to the overlay to ensure we capture all events
		overlay.addEventListener('mousemove', onMouseMove)
		overlay.addEventListener('pointermove', onPointerMove)
		overlay.addEventListener('mouseup', cleanup)
		overlay.addEventListener('pointerup', cleanup)
		overlay.addEventListener('mouseleave', cleanup)
		
		// Store the mousedown handler reference for proper cleanup
		const onMouseDown = (e: MouseEvent) => {
			// If user clicks anywhere on the overlay, start tracking from that position
			if (e.buttons === 1) { // Left mouse button
				handleMove(e.clientX)
			}
		}
		overlay.addEventListener('mousedown', onMouseDown)
		
		// Add keyboard support for accessibility and escape hatch
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				cleanup()
			}
		}
		overlay.addEventListener('keydown', onKeyDown)
		overlay.setAttribute('tabindex', '0') // Make overlay focusable for keyboard events
		
		// Capture the pointer to ensure we get all mouse events
		const divider = container.querySelector('[role="separator"]') as HTMLElement
		if (divider) {
			divider.setPointerCapture(0)
		}

		// Disable pointer events on all iframes during drag to prevent interference
		const iframes = document.querySelectorAll('iframe')
		const originalIframeStyles: Array<{ element: HTMLIFrameElement; originalStyle: string }> = []
		iframes.forEach(iframe => {
			originalIframeStyles.push({
				element: iframe,
				originalStyle: iframe.style.pointerEvents
			})
			iframe.style.pointerEvents = 'none'
		})

		// Fallback mechanism: periodically check if we're still dragging
		// This helps catch cases where pointer events are lost
		const fallbackInterval = setInterval(() => {
			if (!dragging) {
				clearInterval(fallbackInterval)
				return
			}
			
			// Check if we're still dragging by verifying the mouse button state
			// This is more reliable than just checking position
			if (window.event?.buttons === 0) {
				cleanup()
				return
			}
			
			// Also check if we need to recover from lost events
			// by looking at the current mouse position
			if (window.event && window.event.clientX !== undefined) {
				const currentX = window.event.clientX
				if (Math.abs(currentX - lastKnownX) > 5) { // If mouse moved significantly
					handleMove(currentX)
				}
			}
			
			// Check if mouse has re-entered the viewport after being outside
			// This helps recover from cases where the mouse left and came back
			if (window.event && window.event.clientX !== undefined) {
				const currentX = window.event.clientX
				if (currentX >= 0 && currentX <= window.innerWidth && 
					Math.abs(currentX - lastKnownX) > 10) { // Significant movement after re-entry
					handleMove(currentX)
				}
			}
		}, 100) // Check every 100ms for button state

		function handleMove(clientX: number) {
			lastKnownX = clientX
			
			// Clamp the clientX to the viewport bounds to prevent extreme values
			const clampedClientX = Math.max(0, Math.min(clientX, window.innerWidth))
			
			const relativeX = clampedClientX - rect.left
			const percent = (relativeX / rect.width) * 100
			const clamped = computeSplitPercent(percent)
			
			// Provide visual feedback when near boundaries
			if (clamped <= 22 || clamped >= 78) {
				overlay.style.border = '2px dashed rgba(239, 68, 68, 0.6)' // Red border near limits
				dragLine.style.backgroundColor = 'rgba(239, 68, 68, 0.8)' // Red drag line near limits
			} else {
				overlay.style.border = '2px dashed rgba(59, 130, 246, 0.3)' // Blue border normally
				dragLine.style.backgroundColor = 'rgba(59, 130, 246, 0.8)' // Blue drag line normally
			}
			
			setSplitPercent(clamped)
			setCookie(clamped)
			indicator.textContent = `${Math.round(clamped)}%`
			
			// Update the drag line position relative to the container
			const dragLineLeft = Math.max(0, Math.min(relativeX, rect.width))
			dragLine.style.left = `${dragLineLeft}px`
		}

		function onMouseMove(e: MouseEvent) {
			if (!dragging || e.buttons === 0) {
				cleanup()
				return
			}
			// Ensure the mouse position is within reasonable bounds
			if (e.clientX < 0 || e.clientX > window.innerWidth) {
				// If mouse is outside viewport, use the last known position
				// but don't update the split - just maintain the current state
				return
			}
			handleMove(e.clientX)
		}

		function onPointerMove(e: PointerEvent) {
			if (!dragging || e.buttons === 0) {
				cleanup()
				return
			}
			// Ensure the pointer position is within reasonable bounds
			if (e.clientX < 0 || e.clientX > window.innerWidth) {
				// If pointer is outside viewport, use the last known position
				// but don't update the split - just maintain the current state
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
			
			// Remove event listeners from overlay
			overlay.removeEventListener('mousemove', onMouseMove)
			overlay.removeEventListener('pointermove', onPointerMove)
			overlay.removeEventListener('mouseup', cleanup)
			overlay.removeEventListener('pointerup', cleanup)
			overlay.removeEventListener('mouseleave', cleanup)
			overlay.removeEventListener('mousedown', onMouseDown) // Remove mousedown listener
			overlay.removeEventListener('keydown', onKeyDown) // Remove keyboard listener
			overlay.removeAttribute('tabindex') // Remove tabindex
			
			// Remove the global overlay
			if (overlay.parentNode) {
				overlay.parentNode.removeChild(overlay)
			}
			// Remove the indicator
			if (indicator.parentNode) {
				indicator.parentNode.removeChild(indicator)
			}
			// Remove the help text
			if (helpText.parentNode) {
				helpText.parentNode.removeChild(helpText)
			}
			// Remove the drag line
			if (dragLine.parentNode) {
				dragLine.parentNode.removeChild(dragLine)
			}
			
			// Clear the fallback interval
			clearInterval(fallbackInterval)
			
			// Release pointer capture
			if (divider) {
				divider.releasePointerCapture(0)
			}

			// Restore iframe pointer events
			originalIframeStyles.forEach(({ element, originalStyle }) => {
				element.style.pointerEvents = originalStyle
			})

			window.removeEventListener('mousemove', onMouseMove)
			window.removeEventListener('pointermove', onPointerMove)
			window.removeEventListener('mouseup', cleanup)
			window.removeEventListener('pointerup', cleanup)
			window.removeEventListener('touchmove', onTouchMove, { passive: false })
			window.removeEventListener('touchend', cleanup)
			document.body.style.cursor = ''
			document.body.style.userSelect = ''
		}

		// Use both mousemove and pointermove for better compatibility
		window.addEventListener('mousemove', onMouseMove)
		window.addEventListener('pointermove', onPointerMove)
		window.addEventListener('mouseup', cleanup)
		window.addEventListener('pointerup', cleanup)
		window.addEventListener('touchmove', onTouchMove, { passive: false })
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
							data.playground?.appName !== data.problem.name ? (
								<div className="hidden md:block">
									<SetAppToPlayground appName={data.problem.name} />
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
							relativePath={data.exerciseStepApp.relativePath}
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
			statusHandlers={{
				404: () => <p>Sorry, we couldn't find an app here.</p>,
				503: () => (
					<div>
						<h1>Service Unavailable</h1>
						<p>
							Sorry, we're having a temporary problem. Please try again later.
						</p>
						<button onClick={() => window.location.reload()}>Refresh</button>
					</div>
				),
			}}
		/>
	)
}
