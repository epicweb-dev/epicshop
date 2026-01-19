import path from 'path'
import { invariantResponse } from '@epic-web/invariant'
import { ElementScrollRestoration } from '@epic-web/restore-scroll'
import {
	getApps,
	isExtraApp,
	isPlaygroundApp,
	type ExtraApp,
} from '@epic-web/workshop-utils/apps.server'
import { getWorkshopConfig } from '@epic-web/workshop-utils/config.server'
import { getEpicVideoInfos } from '@epic-web/workshop-utils/epic-api.server'
import {
	combineServerTimings,
	getServerTimeHeader,
	makeTimings,
	time,
} from '@epic-web/workshop-utils/timing.server'
import * as Tabs from '@radix-ui/react-tabs'
import slugify from '@sindresorhus/slugify'
import * as cookie from 'cookie'
import { useMemo, useRef, useState } from 'react'
import {
	Link,
	data,
	type HeadersFunction,
	type LoaderFunctionArgs,
	type MetaFunction,
	useLoaderData,
	useSearchParams,
} from 'react-router'
import { EpicVideoInfoProvider } from '#app/components/epic-video.tsx'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { type InBrowserBrowserRef } from '#app/components/in-browser-browser.tsx'
import { NavChevrons } from '#app/components/nav-chevrons.tsx'
import { useRevalidationWS } from '#app/components/revalidation-ws.tsx'
import { Preview } from '#app/routes/_app+/exercise+/$exerciseNumber_.$stepNumber.$type+/__shared/preview.tsx'
import { getAppRunningState } from '#app/routes/_app+/exercise+/$exerciseNumber_.$stepNumber.$type+/__shared/utils.tsx'
import { EditFileOnGitHub } from '#app/routes/launch-editor.tsx'
import { SetAppToPlayground } from '#app/routes/set-playground.tsx'
import { createInlineFileComponent, Mdx } from '#app/utils/mdx.tsx'
import { cn } from '#app/utils/misc.tsx'
import { getRootMatchLoaderData } from '#app/utils/root-loader.ts'
import { getSeoMetaTags } from '#app/utils/seo.ts'

// shared split state helpers
const splitCookieName = 'es_split_pct'

function computeSplitPercent(input: unknown, defaultValue = 50): number {
	const value = typeof input === 'number' ? input : Number(input)
	if (Number.isFinite(value)) {
		return Math.min(80, Math.max(20, Math.round(value * 100) / 100))
	}
	return defaultValue
}

function sortExtras(extras: ExtraApp[]) {
	return extras.sort((a, b) =>
		a.title.localeCompare(b.title, undefined, {
			numeric: true,
			sensitivity: 'base',
		}),
	)
}

export const meta: MetaFunction<typeof loader> = (args) => {
	const loaderData = args.data
	const rootData = getRootMatchLoaderData(args.matches)
	if (!loaderData || !rootData) return [{ title: '🦉 | Error' }]

	return getSeoMetaTags({
		title: `📚 | ${loaderData.extra.title} | ${rootData.workshopTitle}`,
		description: `Extra: ${loaderData.extra.title}`,
		ogTitle: loaderData.extra.title,
		ogDescription: `Extra: ${loaderData.extra.title}`,
		instructor: rootData.instructor,
		requestInfo: rootData.requestInfo,
	})
}

export async function loader({ request, params }: LoaderFunctionArgs) {
	const timings = makeTimings('extraLoader')
	invariantResponse(params.extra, 'extra is required')

	const { title: workshopTitle } = getWorkshopConfig()
	const apps = await time(() => getApps({ request, timings }), {
		timings,
		type: 'getApps',
		desc: 'getApps in extra loader',
	})
	const extras = sortExtras(apps.filter(isExtraApp))
	const playgroundApp = apps.find(isPlaygroundApp)
	const extraIndex = extras.findIndex((extra) => extra.dirName === params.extra)
	const extra = extras[extraIndex]
	if (!extra) {
		throw new Response('Extra not found', { status: 404 })
	}

	const readmeFilepath = path.join(extra.fullPath, 'README.mdx')
	const previousExtra = extras[extraIndex - 1]
	const nextExtra = extras[extraIndex + 1]

	const cookieHeader = request.headers.get('cookie')
	const rawSplit = cookieHeader
		? cookie.parse(cookieHeader)[splitCookieName]
		: null
	const splitPercent = computeSplitPercent(rawSplit, 50)

	const { isRunning, portIsAvailable } = await getAppRunningState(extra)

	return data(
		{
			articleId: `workshop-${slugify(workshopTitle)}-${slugify(
				extra.title,
			)}-extra`,
			splitPercent,
			extra: {
				type: 'extra',
				name: extra.name,
				title: extra.title,
				dirName: extra.dirName,
				fullPath: extra.fullPath,
				relativePath: extra.relativePath,
				dev: extra.dev,
				test: extra.test,
				stackBlitzUrl: extra.stackBlitzUrl,
				isRunning,
				portIsAvailable,
				epicVideoEmbeds: extra.epicVideoEmbeds,
				instructionsCode: extra.instructionsCode,
			},
			extraReadme: {
				file: readmeFilepath,
				relativePath: path.join(extra.relativePath, 'README.mdx'),
			},
			playground: playgroundApp
				? ({
						type: 'playground',
						appName: playgroundApp.appName,
						name: playgroundApp.name,
						title: playgroundApp.title,
						fullPath: playgroundApp.fullPath,
						dev: playgroundApp.dev,
						test: playgroundApp.test,
						stackBlitzUrl: playgroundApp.stackBlitzUrl,
						isUpToDate: playgroundApp.isUpToDate,
						...(await getAppRunningState(playgroundApp)),
					} as const)
				: null,
			previousExtra: previousExtra
				? { dirName: previousExtra.dirName, title: previousExtra.title }
				: null,
			nextExtra: nextExtra
				? { dirName: nextExtra.dirName, title: nextExtra.title }
				: null,
			epicVideoInfosPromise: getEpicVideoInfos(extra.epicVideoEmbeds, {
				request,
			}),
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

export default function ExtraRoute() {
	const data = useLoaderData<typeof loader>()
	const inBrowserBrowserRef = useRef<InBrowserBrowserRef>(null)
	const containerRef = useRef<HTMLDivElement>(null)
	const leftPaneRef = useRef<HTMLDivElement>(null)
	const [splitPercent, setSplitPercent] = useState<number>(data.splitPercent)
	const [searchParams] = useSearchParams()
	const showPlaygroundIndicator = data.playground?.appName !== data.extra.name
	const shouldShowSetPlayground =
		showPlaygroundIndicator || data.playground?.isUpToDate === false
	const tabs = ['extra', 'playground'] as const
	const preview = searchParams.get('preview')

	function isValidPreview(
		value: string | null,
	): value is (typeof tabs)[number] {
		return Boolean(value && tabs.includes(value as (typeof tabs)[number]))
	}

	function shouldHideTab(tab: (typeof tabs)[number]) {
		if (tab === 'playground') {
			return ENV.EPICSHOP_DEPLOYED || !data.playground
		}
		return false
	}

	function withParam(
		params: URLSearchParams,
		key: string,
		value: string | null,
	) {
		const next = new URLSearchParams(params)
		if (value === null) {
			next.delete(key)
		} else {
			next.set(key, value)
		}
		return next
	}

	const activeTab =
		isValidPreview(preview) && !shouldHideTab(preview)
			? preview
			: (tabs.find((tab) => !shouldHideTab(tab)) ?? 'extra')

	// Create MDX components with extra-specific InlineFile
	const mdxComponents = useMemo(() => {
		const InlineFile = createInlineFileComponent(() => ({
			name: data.extra.name,
			fullPath: data.extra.fullPath,
		}))
		return {
			// we'll render the title ourselves thank you
			h1: () => null,
			InlineFile,
		}
	}, [data.extra.name, data.extra.fullPath])

	useRevalidationWS({
		watchPaths: [data.extraReadme.file],
	})

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

	return (
		<div className="flex max-w-full grow flex-col">
			<main
				ref={containerRef}
				className="flex grow flex-col sm:h-full sm:min-h-[800px] md:min-h-[unset] lg:flex-row"
			>
				<div
					className="relative flex min-w-0 flex-none basis-full flex-col sm:col-span-1 sm:row-span-1 sm:h-full lg:basis-(--split-pct)"
					style={{ ['--split-pct' as any]: `${splitPercent}%` }}
					ref={leftPaneRef}
				>
					<h1 className="@container h-14 border-b pr-5 pl-10 text-sm leading-tight font-medium">
						<div className="flex h-14 items-center justify-between gap-x-2 py-2 whitespace-nowrap">
							<div className="flex items-center justify-start gap-x-2 uppercase">
								<Link to="/extra" className="hover:underline">
									<span>Extras</span>
								</Link>
								<span>/</span>
								<Link to="." className="hover:underline">
									<span>{data.extra.title}</span>
								</Link>
							</div>
							{shouldShowSetPlayground ? (
								<SetAppToPlayground
									appName={data.extra.name}
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
						className="shadow-on-scrollbox scrollbar-thin scrollbar-thumb-scrollbar flex h-full w-full max-w-none flex-1 scroll-pt-6 flex-col justify-between space-y-6 overflow-y-auto p-2 sm:p-10 sm:pt-8"
					>
						{data.extra.instructionsCode ? (
							<EpicVideoInfoProvider
								epicVideoInfosPromise={data.epicVideoInfosPromise}
							>
								<div className="prose dark:prose-invert sm:prose-lg">
									<Mdx
										code={data.extra.instructionsCode}
										components={mdxComponents}
									/>
								</div>
							</EpicVideoInfoProvider>
						) : (
							<div className="flex h-full items-center justify-center text-lg">
								<p>No instructions yet...</p>
							</div>
						)}
						<div className="mt-auto flex justify-between">
							{data.previousExtra ? (
								<Link
									to={`/extra/${data.previousExtra.dirName}`}
									aria-label="Previous Extra"
									prefetch="intent"
								>
									<span aria-hidden>←</span>
									<span className="hidden xl:inline"> Previous</span>
								</Link>
							) : (
								<span />
							)}
							{data.nextExtra ? (
								<Link
									to={`/extra/${data.nextExtra.dirName}`}
									aria-label="Next Extra"
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
					<div className="@container flex h-16 justify-between border-t border-b-4 lg:border-b-0">
						<div />
						<EditFileOnGitHub
							appName={data.extra.name}
							relativePath={data.extraReadme.relativePath}
						/>
						<NavChevrons
							prev={
								data.previousExtra
									? {
											to: `/extra/${data.previousExtra.dirName}`,
											'aria-label': 'Previous Extra',
										}
									: null
							}
							next={
								data.nextExtra
									? {
											to: `/extra/${data.nextExtra.dirName}`,
											'aria-label': 'Next Extra',
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
					className="bg-border hover:bg-muted hidden w-1 cursor-col-resize lg:block"
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
				<Tabs.Root
					className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
					value={activeTab}
				>
					<Tabs.List className="scrollbar-thin scrollbar-thumb-scrollbar h-14 min-h-14 overflow-x-auto border-b whitespace-nowrap">
						{tabs.map((tab) => {
							const hidden = shouldHideTab(tab)
							return (
								<Tabs.Trigger key={tab} value={tab} hidden={hidden} asChild>
									<Link
										id={`${tab}-tab`}
										className={cn(
											'clip-path-button radix-state-active:z-10 radix-state-active:bg-foreground radix-state-active:text-background radix-state-active:hover:bg-foreground/80 radix-state-active:hover:text-background/80 radix-state-inactive:hover:bg-foreground/20 radix-state-inactive:hover:text-foreground/80 focus:bg-foreground/80 focus:text-background/80 relative h-full px-6 py-4 font-mono text-sm uppercase outline-none',
											hidden ? 'hidden' : 'inline-block',
										)}
										preventScrollReset
										prefetch="intent"
										to={`?${withParam(
											searchParams,
											'preview',
											tab === 'extra' ? null : tab,
										)}`}
									>
										<span className="flex items-center gap-2">
											<span>{tab}</span>
										</span>
									</Link>
								</Tabs.Trigger>
							)
						})}
					</Tabs.List>
					<div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden">
						<Tabs.Content
							value="extra"
							className="radix-state-inactive:hidden flex min-h-0 w-full grow basis-0 items-stretch justify-center self-start"
							forceMount
						>
							<Preview
								appInfo={data.extra}
								inBrowserBrowserRef={inBrowserBrowserRef}
							/>
						</Tabs.Content>
						<Tabs.Content
							value="playground"
							className="radix-state-inactive:hidden flex min-h-0 w-full grow basis-0 items-stretch justify-center self-start"
							forceMount
						>
							<Preview
								appInfo={data.playground}
								inBrowserBrowserRef={inBrowserBrowserRef}
							/>
						</Tabs.Content>
					</div>
				</Tabs.Root>
			</main>
		</div>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}
