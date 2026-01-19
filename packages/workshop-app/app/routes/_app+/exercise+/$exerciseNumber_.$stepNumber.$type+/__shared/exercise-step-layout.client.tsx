'use client'

import { ElementScrollRestoration } from '@epic-web/restore-scroll'
import { useRef, useState } from 'react'
import { Link, Outlet } from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { type InBrowserBrowserRef } from '#app/components/in-browser-browser.tsx'
import { NavChevrons } from '#app/components/nav-chevrons.tsx'
import { useRevalidationWS } from '#app/components/revalidation-ws.tsx'
import { EditFileOnGitHub } from '#app/routes/launch-editor.client.tsx'
import { ProgressToggle } from '#app/routes/progress.client.tsx'
import { SetAppToPlayground } from '#app/routes/set-playground.client.tsx'
import { getExercisePath } from '#app/utils/misc.tsx'
import { Exercise404ErrorBoundary } from '../../__shared/error-boundary.tsx'
import { type Route } from '../+types/_layout.tsx'
import { StepMdx } from './step-mdx.tsx'
import TouchedFiles from './touched-files.tsx'
import { splitCookieName, computeSplitPercent } from './split-utils.ts'
import { getStepTitleBits } from './step-layout-utils.ts'

type ExerciseStepLayoutClientProps = {
	loaderData: Route.ComponentProps['loaderData']
}

export function ExerciseStepLayoutClient({
	loaderData: data,
}: ExerciseStepLayoutClientProps) {
	const inBrowserBrowserRef = useRef<InBrowserBrowserRef>(null)
	const containerRef = useRef<HTMLDivElement>(null)
	const leftPaneRef = useRef<HTMLDivElement>(null)
	const [splitPercent, setSplitPercent] = useState<number>(data.splitPercent)

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

	const titleBits = getStepTitleBits(data)

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
