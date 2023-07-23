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
import { clsx } from 'clsx'
import * as React from 'react'
import { useMemo, useRef, useState, type PropsWithChildren } from 'react'
import { Diff } from '~/components/diff.tsx'
import { Icon } from '~/components/icons.tsx'
import {
	InBrowserBrowser,
	type InBrowserBrowserRef,
} from '~/components/in-browser-browser.tsx'
import { InBrowserTestRunner } from '~/components/in-browser-test-runner.tsx'
import TouchedFiles from '~/components/touched-files.tsx'
import { type loader as rootLoader } from '~/root.tsx'
import {
	PlaygroundChooser,
	SetAppToPlayground,
	SetPlayground,
} from '~/routes/set-playground.tsx'
import type { App } from '~/utils/apps.server.ts'
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
} from '~/utils/apps.server.ts'
import { getDiffCode, getDiffFiles } from '~/utils/diff.server.ts'
import { Mdx, PreWithButtons } from '~/utils/mdx.tsx'
import { cn, getErrorMessage } from '~/utils/misc.tsx'
import {
	isAppRunning,
	isPortAvailable,
} from '~/utils/process-manager.server.ts'
import {
	combineServerTimings,
	getServerTimeHeader,
	makeTimings,
} from '~/utils/timing.server.ts'
import { EditFileOnGitHub, LaunchEditor } from '~/routes/launch-editor.tsx'
import { TestOutput } from '../../test.tsx'
import { NavChevrons } from '~/components/nav-chevrons.tsx'
import { UpdateMdxCache } from '~/routes/update-mdx-cache.tsx'

function pageTitle(
	data: SerializeFrom<typeof loader> | undefined,
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

export const meta: V2_MetaFunction<
	typeof loader,
	{ root: typeof rootLoader }
> = ({ data, matches }) => {
	const rootData = matches.find(m => m.id === 'root')?.data
	const { emoji, stepNumber, title, exerciseNumber, exerciseTitle } =
		pageTitle(data)
	return [
		{
			title: `${emoji} | ${stepNumber}. ${title} | ${exerciseNumber}. ${exerciseTitle} | ${
				rootData?.workshopTitle ?? 'KCD Workshop'
			}`,
		},
	]
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
		if (a?.dev.type !== 'script') {
			return { isRunning: false, portIsAvailable: null }
		}
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
		exerciseApps[exerciseApps.length - 1]?.name === exerciseStepApp.name
	const isFirstStep = exerciseApps[0]?.name === exerciseStepApp.name

	const nextApp = await getNextExerciseApp(exerciseStepApp, cacheOptions)
	const prevApp = await getPrevExerciseApp(exerciseStepApp, cacheOptions)

	async function getDiffProp() {
		if (!app1 || !app2) {
			return {
				app1: app1?.name,
				app2: app2?.name,
				diffCode: null,
				diffFiles: null,
			}
		}
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
							.padStart(2, '0')}/finished`,
				  }
				: nextApp
				? {
						to: getAppPageRoute(nextApp),
				  }
				: null,
			playground: playgroundApp
				? {
						type: 'playground',
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

const tabs = ENV.KCDSHOP_DEPLOYED
	? (['diff'] as const)
	: (['playground', 'problem', 'solution', 'tests', 'diff'] as const)
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

type CodeFileNotificationProps = {
	file: string
	type?: 'solution' | 'problem'
	children: React.ReactNode
} & (
	| {
			variant: 'error'
			cacheLocation?: never
			embeddedKey?: never
	  }
	| {
			variant: 'warning'
			cacheLocation: string
			embeddedKey: string
	  }
)

export default function ExercisePartRoute() {
	const data = useLoaderData<typeof loader>()
	const [searchParams] = useSearchParams()

	const preview = searchParams.get('preview')
	const activeTab = isValidPreview(preview) ? preview : tabs[0]
	const inBrowserBrowserRef = useRef<InBrowserBrowserRef>(null)
	const previewAppUrl = data.playground?.dev.baseUrl

	const CodeFile = useMemo(() => {
		return function CodeFile({ file }: { file: string }) {
			return (
				<div className="border-4 border-[#ff4545] bg-[#ff454519] p-4 text-lg">
					Something went wrong compiling <b>CodeFile</b> for file: <u>{file}</u>{' '}
					to markdown
				</div>
			)
		}
	}, [])

	const CodeFileNotification = useMemo(() => {
		return function CodeFileNotification({
			file,
			type = 'problem',
			children,
			variant,
			cacheLocation,
			embeddedKey,
			...props
		}: CodeFileNotificationProps) {
			const [visibility, setVisibility] = useState('visible')
			const app = data[type]

			const handleClick = () => {
				if (visibility !== 'visible') return
				setVisibility('collapse')
				setTimeout(() => {
					setVisibility('none')
				}, 400)
			}

			const className = clsx(
				'rounded px-4 py-1 font-mono text-sm font-semibold outline-none transition duration-300 ease-in-out',
				{
					'bg-amber-300/70 hover:bg-amber-300/40 active:bg-amber-300/50':
						variant === 'warning',
					'bg-red-300/70 hover:bg-red-300/40 active:bg-red-300/50':
						variant === 'error',
				},
			)

			return (
				<div
					className={clsx('notification important h-15 relative', {
						'duration-400 !my-0 !h-0 !py-0 !opacity-0 transition-all ease-out':
							visibility !== 'visible',
						hidden: visibility === 'none',
					})}
				>
					<div className="absolute right-3 top-3 z-50 flex gap-4">
						{app ? (
							<div className={className} title={`Edit ${file}`}>
								<LaunchEditor appFile={file} appName={app.name} {...props}>
									Edit this File
								</LaunchEditor>
							</div>
						) : null}
						{app && variant === 'warning' ? (
							<div
								className={className}
								title={`Remove the warning from here and from ${file} cache file`}
							>
								<UpdateMdxCache
									handleClick={handleClick}
									cacheLocation={cacheLocation}
									embeddedKey={embeddedKey}
									appFullPath={app.fullPath}
								/>
							</div>
						) : null}
					</div>
					{children}
				</div>
			)
		}
	}, [data])

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
			const app = data[type] || data[data.type]

			const info = (
				<div className="launch-editor-button-wrapper flex underline">
					{children}{' '}
					<svg height={24} width={24}>
						<use href={`/icons.svg#keyboard`} />
					</svg>
				</div>
			)

			return ENV.KCDSHOP_DEPLOYED && app ? (
				<div className="inline-block grow">
					<LaunchEditor appFile={file} appName={app.name} {...props}>
						{info}
					</LaunchEditor>
				</div>
			) : app ? (
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
						className={cn(props.className, {
							'cursor-not-allowed': ENV.KCDSHOP_DEPLOYED,
						})}
						title={
							ENV.KCDSHOP_DEPLOYED
								? 'Cannot link to app in deployed version'
								: undefined
						}
						onClick={event => {
							if (ENV.KCDSHOP_DEPLOYED) event.preventDefault()

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
							className={cn('flex aspect-square items-center justify-center', {
								'cursor-not-allowed': ENV.KCDSHOP_DEPLOYED,
							})}
							title={
								ENV.KCDSHOP_DEPLOYED
									? 'Cannot link to app in deployed version'
									: 'Open in new tab'
							}
							onClick={event => {
								if (ENV.KCDSHOP_DEPLOYED) event.preventDefault()
							}}
						>
							<Icon name="ExternalLink" title="Open in new tab" />
						</a>
					) : null}
				</div>
			)
		}
	}, [searchParams, previewAppUrl])

	const titleBits = pageTitle(data)

	return (
		<div className="flex flex-grow flex-col">
			<div className="grid flex-grow grid-cols-1 lg:grid-cols-2">
				<div className="border-border relative flex h-[50vh] min-h-[450px] lg:h-screen flex-grow flex-col justify-between border-r">
					<h4 className="pl-10 font-mono text-sm font-medium uppercase leading-tight">
						<div className="flex h-14 flex-wrap items-center justify-start gap-x-3 py-2">
							<Link to={`/${titleBits.exerciseNumber}`}>
								{titleBits.exerciseNumber}. {titleBits.exerciseTitle}
							</Link>
							{' | '}
							<Link to=".">
								{titleBits.stepNumber}. {titleBits.title}
								{' | '}
								{titleBits.emoji} {titleBits.type}
							</Link>
							{data.problem &&
							data.playground?.appName !== data.problem.name ? (
								<SetAppToPlayground appName={data.problem.name} />
							) : null}
						</div>
					</h4>
					<article
						className="shadow-on-scrollbox prose dark:prose-invert sm:prose-lg scrollbar-thin scrollbar-thumb-scrollbar h-full w-full max-w-none space-y-6 overflow-y-auto p-10 pt-8"
						data-restore-scroll="true"
					>
						{data.exerciseStepApp.instructionsCode ? (
							<Mdx
								code={data.exerciseStepApp?.instructionsCode}
								components={{
									CodeFile,
									CodeFileNotification,
									InlineFile,
									LinkToApp,
									pre: PreWithButtons,
									// @ts-expect-error 🤷‍♂️ This is fine
									Link,
								}}
							/>
						) : (
							<p>No instructions yet...</p>
						)}
					</article>
					<div className="border-border flex h-16 justify-between border-t border-b-4 lg:border-b-0">
						<div>
							<div className="h-full">
								<TouchedFiles />
							</div>
						</div>
						<EditFileOnGitHub
							appName={data.exerciseStepApp.name}
							relativePath={data.exerciseStepApp.relativePath}
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
				<Tabs.Root
					className="relative flex h-[50vh] min-h-[450px] lg:h-screen flex-col"
					value={activeTab}
					// intentionally no onValueChange here because the Link will trigger the
					// change.
				>
					{/* the scrollbar adds 8 pixels to the bottom of the list which looks
					funny with the border, especially when most of the time the scrollbar
					shouldn't show up anyway. So we hide that extra space with -8px margin-bottom */}
					<Tabs.List className="scrollbar-thin scrollbar-thumb-scrollbar min-h-14 z-20 mb-[-8px] inline-flex h-14 overflow-x-scroll">
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
										'radix-state-active:bg-foreground radix-state-active:hover:bg-foreground/80 radix-state-active:hover:text-background/80 radix-state-active:text-background radix-state-active:z-10 radix-state-inactive:hover:bg-foreground/20 radix-state-inactive:hover:text-foreground/80 clip-path-button relative px-6 py-4 font-mono text-sm uppercase',
									)}
								>
									<Link
										id={`${tab}-tab`}
										className="focus:bg-foreground/80 focus:text-background/80 outline-none"
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
					<div className="border-border relative z-10 flex flex-grow flex-col border-t">
						<Tabs.Content
							value="playground"
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
							value="problem"
							className="radix-state-inactive:hidden flex flex-grow items-center justify-center"
						>
							<Preview
								appInfo={data.problem}
								inBrowserBrowserRef={inBrowserBrowserRef}
							/>
						</Tabs.Content>
						<Tabs.Content
							value="solution"
							className="radix-state-inactive:hidden flex flex-grow items-center justify-center"
						>
							<Preview
								appInfo={data.solution}
								inBrowserBrowserRef={inBrowserBrowserRef}
							/>
						</Tabs.Content>
						<Tabs.Content
							value="tests"
							className="radix-state-inactive:hidden flex max-h-[calc(100vh-53px)] flex-grow items-start justify-center overflow-hidden"
						>
							<Tests
								appInfo={data.playground}
								problemAppName={data.problem?.name}
								allApps={data.allApps}
							/>
						</Tabs.Content>
						<Tabs.Content
							value="diff"
							className="radix-state-inactive:hidden flex flex-grow items-start justify-center"
						>
							<Diff diff={data.diff} allApps={data.allApps} />
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
			<div className="scrollbar-thin scrollbar-thumb-scrollbar relative h-full flex-grow overflow-y-auto">
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
	return (
		<PlaygroundWindow
			appInfo={playgroundAppInfo}
			problemAppName={problemAppName}
			allApps={allApps}
		>
			<Preview
				appInfo={playgroundAppInfo}
				inBrowserBrowserRef={inBrowserBrowserRef}
			/>
		</PlaygroundWindow>
	)
}

function PlaygroundWindow({
	appInfo: playgroundAppInfo,
	problemAppName,
	allApps,
	children,
}: {
	appInfo: SerializeFrom<typeof loader>['playground']
	problemAppName?: string
	allApps: Array<{ name: string; displayName: string }>
	children: React.ReactNode
}) {
	const playgroundLinkedUI =
		playgroundAppInfo?.appName === problemAppName ? (
			<Icon size={28} name="Linked" title="Click to reset Playground." />
		) : (
			<Icon
				title="Playground is not set to the right app. Click to set Playground."
				size={28}
				name="Unlinked"
				className="text-foreground-danger animate-pulse"
			/>
		)
	return (
		<div className="flex h-full w-full flex-col justify-between">
			<div className="border-border flex h-14 items-center justify-start gap-1 border-b px-3">
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
				{children}
			</div>
		</div>
	)
}

function Tests({
	appInfo: playgroundAppInfo,
	problemAppName,
	allApps,
}: {
	appInfo: SerializeFrom<typeof loader>['playground']
	problemAppName?: string
	allApps: Array<{ name: string; displayName: string }>
}) {
	const [inBrowserTestKey, setInBrowserTestKey] = useState(0)
	let testUI = <p>No tests here. Sorry.</p>
	if (playgroundAppInfo?.test.type === 'script') {
		testUI = <TestOutput name={playgroundAppInfo.name} />
	}
	if (playgroundAppInfo?.test.type === 'browser') {
		const { baseUrl } = playgroundAppInfo.test
		testUI = (
			<div
				className="scrollbar-thin scrollbar-thumb-scrollbar flex h-full w-full flex-grow flex-col overflow-y-auto"
				key={inBrowserTestKey}
			>
				{playgroundAppInfo.test.testFiles.map(testFile => {
					return (
						<div key={testFile}>
							<InBrowserTestRunner baseUrl={baseUrl} testFile={testFile} />
						</div>
					)
				})}
				<div className="px-3 py-[21px]">
					{playgroundAppInfo.type === 'solution' ? (
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
	return (
		<PlaygroundWindow
			appInfo={playgroundAppInfo}
			problemAppName={problemAppName}
			allApps={allApps}
		>
			{testUI}
		</PlaygroundWindow>
	)
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
