import * as Tabs from '@radix-ui/react-tabs'
import type {
	DataFunctionArgs,
	HeadersFunction,
	SerializeFrom,
	V2_MetaFunction,
} from '@remix-run/node'
import { defer, redirect } from '@remix-run/node'
import {
	Link,
	isRouteErrorResponse,
	useLoaderData,
	useRouteError,
	useSearchParams,
	type LinkProps,
} from '@remix-run/react'
import clsx from 'clsx'
import * as React from 'react'
import { useMemo, useRef, useState, type PropsWithChildren } from 'react'
import { Diff } from '~/components/diff'
import Icon from '~/components/icons'
import {
	InBrowserBrowser,
	type InBrowserBrowserRef,
} from '~/components/in-browser-browser'
import { InBrowserTestRunner } from '~/components/in-browser-test-runner'
import TouchedFiles from '~/components/touched-files'
import { type loader as rootLoader } from '~/root'
import {
	PlaygroundChooser,
	SetAppToPlayground,
	SetPlayground,
} from '~/routes/set-playground'
import type { App } from '~/utils/apps.server'
import {
	getAppByName,
	getAppPageRoute,
	getApps,
	getExerciseApp,
	getNextExerciseApp,
	getPrevExerciseApp,
	isExerciseStepApp,
	isPlaygroundApp,
	requireExercise,
	requireExerciseApp,
} from '~/utils/apps.server'
import { getDiffCode, getDiffFiles } from '~/utils/diff.server'
import { Mdx, PreWithCopyToClipboard } from '~/utils/mdx'
import { getErrorMessage } from '~/utils/misc'
import { isAppRunning, isPortAvailable } from '~/utils/process-manager.server'
import {
	combineServerTimings,
	getServerTimeHeader,
	makeTimings,
} from '~/utils/timing.server'
import { LaunchEditor } from '../../launch-editor'
import { TestOutput } from '../../test'

function pageTitle(data: SerializeFrom<typeof loader>, workshopTitle?: string) {
	if (!data) {
		return 'Error'
	}
	const exerciseNumber = data.exerciseStepApp.exerciseNumber
		.toString()
		.padStart(2, '0')
	const stepNumber = data.exerciseStepApp.stepNumber.toString().padStart(2, '0')
	const emoji = (
		{
			problem: '💪',
			solution: '🏁',
		} as const
	)[data.type]
	const title = data[data.type]?.title ?? 'N/A'
	return workshopTitle
		? `${emoji} | ${stepNumber}. ${title} | ${exerciseNumber}. ${data.exerciseTitle} | ${workshopTitle}`
		: `${exerciseNumber}. ${data.exerciseTitle} | ${stepNumber}. ${title} | ${emoji} ${data.type}`
}

export const meta: V2_MetaFunction<
	typeof loader,
	{ root: typeof rootLoader }
> = ({ data, matches }) => {
	const rootData = matches.find(m => m.id === 'root')?.data
	return [{ title: pageTitle(data, rootData?.workshopTitle) }]
}

export async function loader({ request, params }: DataFunctionArgs) {
	const timings = makeTimings('exerciseStepTypeLoader')
	const cacheOptions = { request, timings }
	const exerciseStepApp = await requireExerciseApp(params, cacheOptions)
	const exercise = await requireExercise(
		exerciseStepApp.exerciseNumber,
		cacheOptions,
	)
	const reqUrl = new URL(request.url)

	const pathnameParam = reqUrl.searchParams.get('pathname')
	if (pathnameParam === '' || pathnameParam === '/') {
		reqUrl.searchParams.delete('pathname')
		throw redirect(reqUrl.toString())
	}

	const problemApp = await getExerciseApp(
		{ ...params, type: 'problem' },
		cacheOptions,
	)
	const solutionApp = await getExerciseApp(
		{ ...params, type: 'solution' },
		cacheOptions,
	)

	if (!problemApp && !solutionApp) {
		throw new Response('Not found', { status: 404 })
	}

	const allAppsFull = await getApps(cacheOptions)
	const playgroundApp = allAppsFull.find(isPlaygroundApp)

	const app1Name = reqUrl.searchParams.get('app1')
	const app2Name = reqUrl.searchParams.get('app2')
	const app1 = app1Name
		? await getAppByName(app1Name)
		: playgroundApp || problemApp
	const app2 = app2Name ? await getAppByName(app2Name) : solutionApp

	if (!app1 || !app2) {
		throw new Response('No app to compare to', { status: 404 })
	}

	function getDisplayName(a: App) {
		let displayName = `${a.title} (${a.type})`
		if (isExerciseStepApp(a)) {
			displayName = `${a.exerciseNumber}.${a.stepNumber} ${a.title} (${
				{ problem: '💪', solution: '🏁' }[a.type]
			} ${a.type})`
		} else if (isPlaygroundApp(a)) {
			const playgroundAppBasis = allAppsFull.find(
				otherApp => a.appName === otherApp.name,
			)
			if (playgroundAppBasis) {
				const basisDisplayName = getDisplayName(playgroundAppBasis)
				displayName = `🛝 Playground: ${basisDisplayName}`
			} else {
				displayName = `🛝 Playground: ${a.appName}`
			}
		}
		return displayName
	}

	async function getAppRunningState(a: App) {
		if (a?.dev.type !== 'script')
			return { isRunning: false, portIsAvailable: null }
		const isRunning = isAppRunning(a)
		const portIsAvailable = isRunning
			? null
			: await isPortAvailable(a.dev.portNumber)
		return { isRunning, portIsAvailable }
	}

	const allApps = allAppsFull
		.filter((a, i, ar) => ar.findIndex(b => a.name === b.name) === i)
		.map(a => ({
			displayName: getDisplayName(a),
			name: a.name,
			title: a.title,
			type: a.type,
		}))

	const exerciseApps = allAppsFull
		.filter(isExerciseStepApp)
		.filter(app => app.exerciseNumber === exerciseStepApp.exerciseNumber)
	const isLastStep =
		exerciseApps[exerciseApps.length - 1]?.id === exerciseStepApp.id
	const isFirstStep = exerciseApps[0]?.id === exerciseStepApp.id

	const nextApp = await getNextExerciseApp(exerciseStepApp, cacheOptions)
	const prevApp = await getPrevExerciseApp(exerciseStepApp, cacheOptions)

	const getDiffProp = async () => {
		const [diffCode, diffFiles] = await Promise.all([
			getDiffCode(app1, app2, cacheOptions).catch(e => {
				console.error(e)
				return null
			}),
			problemApp && solutionApp
				? getDiffFiles(problemApp, solutionApp, cacheOptions).catch(e => {
						console.error(e)
						return 'There was a problem generating the diff'
				  })
				: 'No diff available',
		])
		return {
			app1: app1.name,
			app2: app2.name,
			diffCode,
			diffFiles,
		}
	}

	return defer(
		{
			type: params.type as 'problem' | 'solution',
			exerciseStepApp,
			exerciseTitle: exercise.title,
			allApps,
			prevStepLink: isFirstStep
				? {
						to: `/${exerciseStepApp.exerciseNumber
							.toString()
							.padStart(2, '0')}`,
						children: `⬅️ ${exercise.title}`,
				  }
				: prevApp
				? {
						to: getAppPageRoute(prevApp),
						children: `⬅️ ${prevApp.title} (${prevApp.type})`,
				  }
				: null,
			nextStepLink: isLastStep
				? {
						to: `/${exerciseStepApp.exerciseNumber
							.toString()
							.padStart(2, '0')}/feedback`,
						children: `${exercise.title} Feedback ➡️`,
				  }
				: nextApp
				? {
						to: getAppPageRoute(nextApp),
						children: `${nextApp.title} (${nextApp.type}) ➡️`,
				  }
				: null,
			playground: playgroundApp
				? {
						type: 'playground',
						id: playgroundApp.id,
						fullPath: playgroundApp.fullPath,
						dev: playgroundApp.dev,
						test: playgroundApp.test,
						title: playgroundApp.title,
						name: playgroundApp.name,
						appName: playgroundApp.appName,
						...(await getAppRunningState(playgroundApp)),
				  }
				: null,
			problem: problemApp
				? {
						type: 'problem',
						id: problemApp.id,
						fullPath: problemApp.fullPath,
						dev: problemApp.dev,
						test: problemApp.test,
						title: problemApp.title,
						name: problemApp.name,
						...(await getAppRunningState(problemApp)),
				  }
				: null,
			solution: solutionApp
				? {
						type: 'solution',
						id: solutionApp.id,
						fullPath: solutionApp.fullPath,
						dev: solutionApp.dev,
						test: solutionApp.test,
						title: solutionApp.title,
						name: solutionApp.name,
						...(await getAppRunningState(solutionApp)),
				  }
				: null,
			diff: getDiffProp(),
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

const tabs = ['playground', 'problem', 'solution', 'tests', 'diff'] as const
const isValidPreview = (s: string | null): s is (typeof tabs)[number] =>
	Boolean(s && tabs.includes(s as (typeof tabs)[number]))

function withParam(
	searchParams: URLSearchParams,
	key: string,
	value: string | null,
) {
	const newSearchParams = new URLSearchParams(searchParams)
	if (value === null) {
		newSearchParams.delete(key)
	} else {
		newSearchParams.set(key, value)
	}
	return newSearchParams
}

export default function ExercisePartRoute() {
	const data = useLoaderData<typeof loader>()
	const [searchParams] = useSearchParams()

	const preview = searchParams.get('preview')
	const activeTab = isValidPreview(preview) ? preview : tabs[0]
	const inBrowserBrowserRef = useRef<InBrowserBrowserRef>(null)
	const previewAppUrl = data.playground?.dev.baseUrl

	const InlineFile = useMemo(() => {
		return function InlineFile({
			file,
			type = 'playground',
			children = <code>{file}</code>,
			...props
		}: Omit<PropsWithChildren<typeof LaunchEditor>, 'appName'> & {
			file: string
			type?: 'playground' | 'solution' | 'problem'
		}) {
			const app = data[type]

			const info = (
				<div className="launch-editor-button-wrapper flex items-center justify-center underline">
					{children}{' '}
					<img
						title="Open in editor"
						alt="Open in editor"
						className="!m-0"
						src="/icons/keyboard-2.svg"
					/>
				</div>
			)

			return app ? (
				<div className="inline-block grow">
					<LaunchEditor appFile={file} appName={app.name} {...props}>
						{info}
					</LaunchEditor>
				</div>
			) : type === 'playground' ? (
				// playground does not exist yet
				<div
					className="inline-block grow cursor-not-allowed"
					title="You must 'Set to Playground' before opening a file"
				>
					{info}
				</div>
			) : (
				<>children</>
			)
		}
	}, [data])

	const LinkToApp = useMemo(() => {
		return function LinkToApp({
			to: appTo,
			children = <code>{appTo.toString()}</code>,
			...props
		}: LinkProps) {
			const to = `?${withParam(
				searchParams,
				'pathname',
				appTo.toString(),
			).toString()}`
			const href = previewAppUrl
				? previewAppUrl.slice(0, -1) + appTo.toString()
				: null
			return (
				<div className="inline-flex items-center justify-between gap-1">
					<Link
						to={to}
						{...props}
						onClick={event => {
							props.onClick?.(event)
							inBrowserBrowserRef.current?.handleExtrnalNavigation(
								appTo.toString(),
							)
						}}
					>
						{children}
					</Link>
					{href ? (
						<a
							href={href}
							target="_blank"
							rel="noreferrer"
							title="Open in new tab"
							className={clsx('flex aspect-square items-center justify-center')}
						>
							<Icon name="ExternalLink" title="Open in new tab" />
						</a>
					) : null}
				</div>
			)
		}
	}, [searchParams, previewAppUrl])

	return (
		<div className="flex flex-grow flex-col">
			<div className="grid flex-grow grid-cols-2">
				<div className="relative flex h-screen flex-grow flex-col justify-between border-r border-gray-200">
					<h4 className="py-8 pl-[58px] font-mono text-sm font-medium uppercase leading-tight">
						<div className="flex flex-wrap items-center justify-start gap-3">
							{pageTitle(data)}
							{data.problem &&
							data.playground?.appName !== data.problem.name ? (
								<SetAppToPlayground appName={data.problem.name} />
							) : null}
						</div>
					</h4>
					<article className="shadow-on-scrollbox prose sm:prose-lg scrollbar-thin scrollbar-thumb-gray-200 prose-p:text-black prose-headings:text-black h-full w-full max-w-none space-y-6 overflow-y-auto p-14 pt-0 text-black">
						{data.exerciseStepApp.instructionsCode ? (
							<Mdx
								code={data.exerciseStepApp?.instructionsCode}
								components={{
									InlineFile,
									LinkToApp,
									pre: PreWithCopyToClipboard,
								}}
							/>
						) : (
							<p>No instructions yet...</p>
						)}
					</article>
					<div className="flex h-16 justify-between border-t border-gray-200 bg-white">
						<div>
							<div className="h-full">
								<TouchedFiles />
							</div>
						</div>
						<div className="relative flex overflow-hidden">
							{data.prevStepLink ? (
								<Link
									prefetch="intent"
									className="group flex h-full items-center justify-center border-l border-gray-200 px-7"
									to={data.prevStepLink.to}
									children={
										<>
											<Icon
												name="ChevronLeft"
												className="absolute opacity-100 transition duration-300 ease-in-out group-hover:translate-y-10 group-hover:opacity-0"
											/>
											<Icon
												name="ChevronLeft"
												className="absolute -translate-y-10 opacity-0 transition duration-300 ease-in-out group-hover:translate-y-0 group-hover:opacity-100"
											/>
										</>
									}
								/>
							) : null}
							{data.nextStepLink ? (
								<Link
									prefetch="intent"
									className="group flex h-full items-center justify-center border-l border-gray-200 px-7"
									to={data.nextStepLink.to}
									children={
										<>
											<Icon
												name="ChevronRight"
												className="absolute opacity-100 transition duration-300 ease-in-out group-hover:translate-y-10 group-hover:opacity-0"
											/>
											<Icon
												name="ChevronRight"
												className="absolute -translate-y-10 opacity-0 transition duration-300 ease-in-out group-hover:translate-y-0 group-hover:opacity-100"
											/>
										</>
									}
								/>
							) : null}
						</div>
					</div>
				</div>
				<Tabs.Root
					className="relative flex h-screen flex-col"
					value={activeTab}
					// intentionally no onValueChange here because the Link will trigger the
					// change.
				>
					<Tabs.List className="inline-flex border-b border-gray-200">
						{tabs.map(tab => {
							return (
								<Tabs.Trigger
									key={tab}
									value={tab}
									hidden={
										tab === 'tests' && data.playground?.test.type === 'none'
									}
									asChild
									className={clsx(
										'radix-state-active:bg-black radix-state-active:hover:bg-gray-700 radix-state-active:text-white radix-state-active:z-10 radix-state-inactive:hover:bg-gray-100 clip-path-button relative px-6 py-4 font-mono text-sm uppercase',
									)}
								>
									<Link
										id="tab"
										className="outline-none focus:bg-gray-100"
										preventScrollReset
										prefetch="intent"
										to={`?${withParam(
											searchParams,
											'preview',
											tab === 'playground' ? null : tab,
										)}`}
									>
										{tab}
									</Link>
								</Tabs.Trigger>
							)
						})}
					</Tabs.List>
					<div className="relative z-10 flex flex-grow flex-col">
						<Tabs.Content
							value={tabs[0]}
							className="radix-state-inactive:hidden flex flex-grow items-center justify-center"
						>
							<Playground
								appInfo={data.playground}
								problemAppName={data.problem?.name}
								inBrowserBrowserRef={inBrowserBrowserRef}
								allApps={data.allApps}
							/>
						</Tabs.Content>
						<Tabs.Content
							value={tabs[1]}
							className="radix-state-inactive:hidden flex flex-grow items-center justify-center"
						>
							<Preview
								appInfo={data.problem}
								inBrowserBrowserRef={inBrowserBrowserRef}
							/>
						</Tabs.Content>
						<Tabs.Content
							value={tabs[2]}
							className="radix-state-inactive:hidden flex flex-grow items-center justify-center"
						>
							<Preview
								appInfo={data.solution}
								inBrowserBrowserRef={inBrowserBrowserRef}
							/>
						</Tabs.Content>
						<Tabs.Content
							value={tabs[3]}
							className="radix-state-inactive:hidden flex max-h-[calc(100vh-53px)] flex-grow items-start justify-center overflow-hidden"
						>
							<Tests appInfo={data.playground} />
						</Tabs.Content>
						<Tabs.Content
							value={tabs[4]}
							className="radix-state-inactive:hidden flex flex-grow items-start justify-center"
						>
							<Diff />
						</Tabs.Content>
					</div>
				</Tabs.Root>
			</div>
		</div>
	)
}

function Preview({
	appInfo,
	inBrowserBrowserRef,
}: {
	appInfo: SerializeFrom<typeof loader>['problem' | 'solution' | 'playground']
	inBrowserBrowserRef: React.RefObject<InBrowserBrowserRef>
}) {
	if (!appInfo) return <p>No app here. Sorry.</p>
	const { isRunning, dev, name, portIsAvailable, title } = appInfo

	if (dev.type === 'script') {
		return (
			<InBrowserBrowser
				ref={inBrowserBrowserRef}
				isRunning={isRunning}
				name={name}
				portIsAvailable={portIsAvailable}
				port={dev.portNumber}
				baseUrl={dev.baseUrl}
			/>
		)
	} else {
		return (
			<div className="scrollbar-thin scrollbar-thumb-gray-300 relative h-full flex-grow overflow-y-auto">
				<a
					href={dev.baseUrl}
					target="_blank"
					rel="noreferrer"
					className={clsx(
						'absolute bottom-5 right-5 flex items-center justify-center rounded-full bg-gray-100 p-2.5 transition hover:bg-gray-200',
					)}
				>
					<Icon name="ExternalLink" aria-hidden="true" />
					<span className="sr-only">Open in New Window</span>
				</a>
				<iframe
					title={title}
					src={dev.baseUrl}
					className="h-full w-full flex-grow bg-white p-3"
				/>
			</div>
		)
	}
}

function Playground({
	appInfo: playgroundAppInfo,
	inBrowserBrowserRef,
	problemAppName,
	allApps,
}: {
	appInfo: SerializeFrom<typeof loader>['playground']
	inBrowserBrowserRef: React.RefObject<InBrowserBrowserRef>
	problemAppName?: string
	allApps: Array<{ name: string; displayName: string }>
}) {
	const playgroundLinkedUI =
		playgroundAppInfo?.appName === problemAppName ? (
			<Icon
				title="Click to reset Playground."
				viewBox="0 0 24 24"
				size="28"
				name="Linked"
			/>
		) : (
			<Icon
				title="Playground is not set to the right app. Click to set Playground."
				viewBox="0 0 24 24"
				size="28"
				name="Unlinked"
				className="animate-pulse text-rose-700"
			/>
		)
	return (
		<div className="flex h-full w-full flex-col justify-between">
			<div className="flex h-14 items-center justify-start gap-1 border-b border-gray-200 px-3">
				{problemAppName ? (
					<SetPlayground appName={problemAppName}>
						{playgroundLinkedUI}
					</SetPlayground>
				) : (
					<div className="flex">playgroundLinkedUI</div>
				)}
				<PlaygroundChooser
					allApps={allApps}
					playgroundAppName={playgroundAppInfo?.appName}
				/>
			</div>
			<div className="flex flex-1 flex-grow items-center justify-center">
				<Preview
					appInfo={playgroundAppInfo}
					inBrowserBrowserRef={inBrowserBrowserRef}
				/>
			</div>
		</div>
	)
}

function Tests({
	appInfo,
}: {
	appInfo: SerializeFrom<typeof loader>['playground']
}) {
	const [inBrowserTestKey, setInBrowserTestKey] = useState(0)
	if (!appInfo || appInfo.test.type === 'none') {
		return <p>No tests here. Sorry.</p>
	}
	if (appInfo.test.type === 'script') {
		return <TestOutput id={appInfo.id} />
	}
	if (appInfo.test.type === 'browser') {
		const { baseUrl } = appInfo.test
		return (
			<div
				className="scrollbar-thin scrollbar-thumb-gray-300 flex h-full w-full flex-grow flex-col overflow-y-auto"
				key={inBrowserTestKey}
			>
				{appInfo.test.testFiles.map(testFile => {
					return (
						<div key={testFile}>
							<InBrowserTestRunner baseUrl={baseUrl} testFile={testFile} />
						</div>
					)
				})}
				<div className="px-3 py-[21px]">
					{appInfo.type === 'solution' ? (
						<div>NOTE: these tests are running on the solution</div>
					) : null}
					<button
						onClick={() => setInBrowserTestKey(c => c + 1)}
						className="flex items-center gap-2 font-mono text-sm uppercase leading-none"
					>
						<Icon name="Refresh" aria-hidden /> Rerun All Tests
					</button>
				</div>
			</div>
		)
	}
	return null
}

export function ErrorBoundary() {
	const error = useRouteError()

	if (typeof document !== 'undefined') {
		console.error(error)
	}

	return isRouteErrorResponse(error) ? (
		error.status === 404 ? (
			<p>Sorry, we couldn't find an app here.</p>
		) : (
			<p>
				{error.status} {error.data}
			</p>
		)
	) : (
		<p>{getErrorMessage(error)}</p>
	)
}
