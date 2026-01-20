import path from 'path'
import { invariantResponse } from '@epic-web/invariant'
import { ElementScrollRestoration } from '@epic-web/restore-scroll'
import {
	getAppByName,
	getAppDisplayName,
	getApps,
	isExtraApp,
	isPlaygroundApp,
	type ExtraApp,
} from '@epic-web/workshop-utils/apps.server'
import { getWorkshopConfig } from '@epic-web/workshop-utils/config.server'
import { getDiffCode } from '@epic-web/workshop-utils/diff.server'
import { getEpicVideoInfos } from '@epic-web/workshop-utils/epic-api.server'
import {
	combineServerTimings,
	getServerTimeHeader,
	makeTimings,
	time,
} from '@epic-web/workshop-utils/timing.server'
import * as Tabs from '@radix-ui/react-tabs'
import slugify from '@sindresorhus/slugify'
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
import { Diff } from '#app/components/diff.tsx'
import { DiscordChat } from '#app/components/discord-chat.tsx'
import { EpicVideoInfoProvider } from '#app/components/epic-video.tsx'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { type InBrowserBrowserRef } from '#app/components/in-browser-browser.tsx'
import { NavChevrons } from '#app/components/nav-chevrons.tsx'
import {
	getPreviewSearchParams,
	PreviewTabsList,
} from '#app/components/preview-tabs.tsx'
import { useRevalidationWS } from '#app/components/revalidation-ws.tsx'
import { useWorkshopConfig } from '#app/components/workshop-config.tsx'
import { Playground } from '#app/routes/_app+/exercise+/$exerciseNumber_.$stepNumber.$type+/__shared/playground.tsx'
import { Preview } from '#app/routes/_app+/exercise+/$exerciseNumber_.$stepNumber.$type+/__shared/preview.tsx'
import { getAppRunningState } from '#app/routes/_app+/exercise+/$exerciseNumber_.$stepNumber.$type+/__shared/utils.tsx'
import { EditFileOnGitHub } from '#app/routes/launch-editor.tsx'
import { SetAppToPlayground } from '#app/routes/set-playground.tsx'
import { fetchDiscordPosts } from '#app/utils/discord.server.ts'
import { createInlineFileComponent, Mdx } from '#app/utils/mdx.tsx'
import {
	getRootMatchLoaderData,
	useRootLoaderData,
} from '#app/utils/root-loader.ts'
import { getSeoMetaTags } from '#app/utils/seo.ts'
import {
	getSplitPercentFromRequest,
	setSplitPercentCookie,
	startSplitDrag,
} from '#app/utils/split-layout.ts'

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
	const cacheOptions = { request, timings }
	const apps = await time(() => getApps(cacheOptions), {
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
	const reqUrl = new URL(request.url)
	const app1Name = reqUrl.searchParams.get('app1')
	const app2Name = reqUrl.searchParams.get('app2')
	const app1 = app1Name
		? await getAppByName(app1Name)
		: (playgroundApp ?? extra)
	const app2 = app2Name ? await getAppByName(app2Name) : extra
	const splitPercent = getSplitPercentFromRequest(request, 50)

	const { isRunning, portIsAvailable } = await getAppRunningState(extra)

	async function getDiffProp() {
		if (!app1 || !app2) {
			return { app1: app1?.name, app2: app2?.name, diffCode: null }
		}
		const diffCode = await getDiffCode(app1, app2, {
			...cacheOptions,
			forceFresh: reqUrl.searchParams.get('forceFresh') === 'diff',
		}).catch((error) => {
			console.error(error)
			return null
		})
		return {
			app1: app1.name,
			app2: app2.name,
			diffCode,
		}
	}

	const allApps = apps
		.filter(
			(app, index, list) =>
				list.findIndex((item) => item.name === app.name) === index,
		)
		.map((app) => ({
			name: app.name,
			displayName: getAppDisplayName(app, apps),
		}))
		.sort((a, b) =>
			a.displayName.localeCompare(b.displayName, undefined, {
				numeric: true,
				sensitivity: 'base',
			}),
		)

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
			allApps,
			diff: getDiffProp(),
			discordPostsPromise: fetchDiscordPosts({ request }),
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
	const rootData = useRootLoaderData()
	const inBrowserBrowserRef = useRef<InBrowserBrowserRef>(null)
	const containerRef = useRef<HTMLDivElement>(null)
	const leftPaneRef = useRef<HTMLDivElement>(null)
	const [splitPercent, setSplitPercent] = useState<number>(data.splitPercent)
	const [searchParams] = useSearchParams()
	const workshopConfig = useWorkshopConfig()
	const userHasAccessPromise = useMemo(
		() => Promise.resolve(rootData.userHasAccess ?? false),
		[rootData.userHasAccess],
	)
	const showPlaygroundIndicator = data.playground?.appName !== data.extra.name
	const shouldShowSetPlayground =
		showPlaygroundIndicator || data.playground?.isUpToDate === false
	const tabs = ['playground', 'extra', 'diff', 'chat'] as const
	const preview = searchParams.get('preview')
	const previousExtraLink = data.previousExtra
		? {
				to: `/extra/${data.previousExtra.dirName}`,
				'aria-label': 'Previous Extra',
			}
		: {
				to: '/extra',
				'aria-label': 'Extras',
			}
	const nextExtraLink = data.nextExtra
		? {
				to: `/extra/${data.nextExtra.dirName}`,
				'aria-label': 'Next Extra',
			}
		: {
				to: '/finished',
				'aria-label': 'Workshop finished',
			}

	function isValidPreview(
		value: string | null,
	): value is (typeof tabs)[number] {
		return Boolean(value && tabs.includes(value as (typeof tabs)[number]))
	}

	function shouldHideTab(tab: (typeof tabs)[number]) {
		if (tab === 'playground') {
			return ENV.EPICSHOP_DEPLOYED
		}
		if (tab === 'extra') {
			if (ENV.EPICSHOP_DEPLOYED) {
				const devType = data.extra.dev.type
				return (
					devType !== 'browser' &&
					devType !== 'export' &&
					!data.extra.stackBlitzUrl
				)
			}
		}
		if (tab === 'chat') {
			return !workshopConfig.product.discordChannelId
		}
		return false
	}

	const activeTab =
		isValidPreview(preview) && !shouldHideTab(preview)
			? preview
			: (tabs.find((tab) => !shouldHideTab(tab)) ?? 'playground')

	const previewTabs = tabs.map((tab) => {
		const hidden = shouldHideTab(tab)
		return {
			id: tab,
			label: tab,
			hidden,
			to: `?${getPreviewSearchParams(searchParams, tab, 'playground')}`,
		}
	})

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
							<Link
								to={previousExtraLink.to}
								aria-label={previousExtraLink['aria-label']}
								prefetch="intent"
							>
								<span aria-hidden>←</span>
								<span className="hidden xl:inline"> Previous</span>
							</Link>
							<Link
								to={nextExtraLink.to}
								aria-label={nextExtraLink['aria-label']}
								prefetch="intent"
							>
								<span className="hidden xl:inline">Next </span>
								<span aria-hidden>→</span>
							</Link>
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
						<NavChevrons prev={previousExtraLink} next={nextExtraLink} />
					</div>
				</div>
				<div
					role="separator"
					aria-orientation="vertical"
					title="Drag to resize"
					className="bg-border hover:bg-muted hidden w-1 cursor-col-resize lg:block"
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
				<Tabs.Root
					className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
					value={activeTab}
				>
					<PreviewTabsList tabs={previewTabs} />
					<div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden">
						<Tabs.Content
							value="playground"
							className="radix-state-inactive:hidden flex min-h-0 w-full grow basis-0 items-stretch justify-center self-start"
							forceMount
						>
							<Playground
								appInfo={data.playground}
								problemAppName={data.extra.name}
								allApps={data.allApps ?? []}
								isUpToDate={data.playground?.isUpToDate ?? false}
								inBrowserBrowserRef={inBrowserBrowserRef}
							/>
						</Tabs.Content>
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
							value="diff"
							className="radix-state-inactive:hidden flex h-full min-h-0 w-full grow basis-0 items-stretch justify-center self-start"
						>
							<Diff
								diff={data.diff}
								allApps={data.allApps}
								userHasAccessPromise={userHasAccessPromise}
							/>
						</Tabs.Content>
						<Tabs.Content
							value="chat"
							className="radix-state-inactive:hidden flex h-full min-h-0 w-full grow basis-0 items-stretch justify-center self-start"
						>
							<DiscordChat discordPostsPromise={data.discordPostsPromise} />
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
