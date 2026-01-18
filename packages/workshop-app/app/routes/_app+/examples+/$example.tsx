import path from 'path'
import { invariantResponse } from '@epic-web/invariant'
import { ElementScrollRestoration } from '@epic-web/restore-scroll'
import {
	getApps,
	isExampleApp,
	type ExampleApp,
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
import * as cookie from 'cookie'
import { useRef, useState } from 'react'
import {
	Link,
	data,
	type HeadersFunction,
	type LoaderFunctionArgs,
	type MetaFunction,
	useLoaderData,
} from 'react-router'
import { EpicVideoInfoProvider } from '#app/components/epic-video.tsx'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { type InBrowserBrowserRef } from '#app/components/in-browser-browser.tsx'
import { NavChevrons } from '#app/components/nav-chevrons.tsx'
import { useRevalidationWS } from '#app/components/revalidation-ws.tsx'
import { Preview } from '#app/routes/_app+/exercise+/$exerciseNumber_.$stepNumber.$type+/__shared/preview.tsx'
import { getAppRunningState } from '#app/routes/_app+/exercise+/$exerciseNumber_.$stepNumber.$type+/__shared/utils.tsx'
import { EditFileOnGitHub } from '#app/routes/launch-editor.tsx'
import { Mdx } from '#app/utils/mdx.tsx'
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

function sortExamples(examples: ExampleApp[]) {
	return examples.sort((a, b) =>
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
		title: `📚 | ${loaderData.example.title} | ${rootData.workshopTitle}`,
		description: `Example: ${loaderData.example.title}`,
		ogTitle: loaderData.example.title,
		ogDescription: `Example: ${loaderData.example.title}`,
		instructor: rootData.instructor,
		requestInfo: rootData.requestInfo,
	})
}

export async function loader({ request, params }: LoaderFunctionArgs) {
	const timings = makeTimings('exampleLoader')
	invariantResponse(params.example, 'example is required')

	const { title: workshopTitle } = getWorkshopConfig()
	const apps = await time(() => getApps({ request, timings }), {
		timings,
		type: 'getApps',
		desc: 'getApps in example loader',
	})
	const examples = sortExamples(apps.filter(isExampleApp))
	const exampleIndex = examples.findIndex(
		(example) => example.dirName === params.example,
	)
	const example = examples[exampleIndex]
	if (!example) {
		throw new Response('Example not found', { status: 404 })
	}

	const readmeFilepath = path.join(example.fullPath, 'README.mdx')
	const previousExample = examples[exampleIndex - 1]
	const nextExample = examples[exampleIndex + 1]

	const cookieHeader = request.headers.get('cookie')
	const rawSplit = cookieHeader
		? cookie.parse(cookieHeader)[splitCookieName]
		: null
	const splitPercent = computeSplitPercent(rawSplit, 50)

	const { isRunning, portIsAvailable } = await getAppRunningState(example)

	return data(
		{
			articleId: `workshop-${slugify(workshopTitle)}-${slugify(
				example.title,
			)}-example`,
			splitPercent,
			example: {
				type: 'example',
				name: example.name,
				title: example.title,
				dirName: example.dirName,
				fullPath: example.fullPath,
				relativePath: example.relativePath,
				dev: example.dev,
				test: example.test,
				stackBlitzUrl: example.stackBlitzUrl,
				isRunning,
				portIsAvailable,
				epicVideoEmbeds: example.epicVideoEmbeds,
				instructionsCode: example.instructionsCode,
			},
			exampleReadme: {
				file: readmeFilepath,
				relativePath: path.join(example.relativePath, 'README.mdx'),
			},
			previousExample: previousExample
				? { dirName: previousExample.dirName, title: previousExample.title }
				: null,
			nextExample: nextExample
				? { dirName: nextExample.dirName, title: nextExample.title }
				: null,
			epicVideoInfosPromise: getEpicVideoInfos(example.epicVideoEmbeds, {
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

// we'll render the title ourselves thank you
const mdxComponents = { h1: () => null }

export default function ExampleRoute() {
	const data = useLoaderData<typeof loader>()
	const inBrowserBrowserRef = useRef<InBrowserBrowserRef>(null)
	const containerRef = useRef<HTMLDivElement>(null)
	const leftPaneRef = useRef<HTMLDivElement>(null)
	const [splitPercent, setSplitPercent] = useState<number>(data.splitPercent)

	useRevalidationWS({
		watchPaths: [`${data.example.relativePath}/README.mdx`],
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
								<Link to="/examples" className="hover:underline">
									<span>Examples</span>
								</Link>
								<span>/</span>
								<Link to="." className="hover:underline">
									<span>{data.example.title}</span>
								</Link>
							</div>
						</div>
					</h1>
					<article
						id={data.articleId}
						key={data.articleId}
						className="shadow-on-scrollbox scrollbar-thin scrollbar-thumb-scrollbar flex h-full w-full max-w-none flex-1 scroll-pt-6 flex-col justify-between space-y-6 overflow-y-auto p-2 sm:p-10 sm:pt-8"
					>
						{data.example.instructionsCode ? (
							<EpicVideoInfoProvider
								epicVideoInfosPromise={data.epicVideoInfosPromise}
							>
								<div className="prose dark:prose-invert sm:prose-lg">
									<Mdx
										code={data.example.instructionsCode}
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
							{data.previousExample ? (
								<Link
									to={`/examples/${data.previousExample.dirName}`}
									aria-label="Previous Example"
									prefetch="intent"
								>
									<span aria-hidden>←</span>
									<span className="hidden xl:inline"> Previous</span>
								</Link>
							) : (
								<span />
							)}
							{data.nextExample ? (
								<Link
									to={`/examples/${data.nextExample.dirName}`}
									aria-label="Next Example"
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
							appName={data.example.name}
							relativePath={data.exampleReadme.relativePath}
						/>
						<NavChevrons
							prev={
								data.previousExample
									? {
											to: `/examples/${data.previousExample.dirName}`,
											'aria-label': 'Previous Example',
										}
									: null
							}
							next={
								data.nextExample
									? {
											to: `/examples/${data.nextExample.dirName}`,
											'aria-label': 'Next Example',
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
				<div className="flex min-w-0 flex-1">
					<Preview
						appInfo={data.example}
						inBrowserBrowserRef={inBrowserBrowserRef}
					/>
				</div>
			</main>
		</div>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}
