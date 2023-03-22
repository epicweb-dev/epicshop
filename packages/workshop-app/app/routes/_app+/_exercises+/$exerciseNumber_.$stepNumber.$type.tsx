import * as Tabs from '@radix-ui/react-tabs'
import type {
	DataFunctionArgs,
	HeadersFunction,
	SerializeFrom,
	V2_MetaFunction,
} from '@remix-run/node'
import { defer, redirect } from '@remix-run/node'
import {
	isRouteErrorResponse,
	Link,
	type LinkProps,
	useLoaderData,
	useRouteError,
	useSearchParams,
} from '@remix-run/react'
import clsx from 'clsx'
import {
	type PropsWithChildren,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react'
import { createPortal } from 'react-dom'
import { useParams } from 'react-router'
import { Diff } from '~/components/diff'
import Icon from '~/components/icons'
import {
	InBrowserBrowser,
	type InBrowserBrowserRef,
} from '~/components/in-browser-browser'
import { InBrowserTestRunner } from '~/components/in-browser-test-runner'
import TouchedFiles, { touchedFilesButton } from '~/components/touched-files'
import { type loader as rootLoader } from '~/root'
import {
	getAppByName,
	getAppPageRoute,
	getApps,
	getExerciseApp,
	getNextExerciseApp,
	getPrevExerciseApp,
	isExerciseStepApp,
	isProblemApp,
	isSolutionApp,
	requireExercise,
	requireExerciseApp,
} from '~/utils/apps.server'
import { getDiffCode } from '~/utils/diff.server'
import { Mdx } from '~/utils/mdx'
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
> = ({ data, parentsData }) => {
	return [{ title: pageTitle(data, parentsData?.root.workshopTitle) }]
}

export async function loader({ request, params }: DataFunctionArgs) {
	const timings = makeTimings('exerciseStepTypeLoader')
	const exerciseStepApp = await requireExerciseApp(params, { request, timings })
	const exercise = await requireExercise(exerciseStepApp.exerciseNumber, {
		request,
		timings,
	})
	const reqUrl = new URL(request.url)

	// delete the preview if it's the same as the type
	if (reqUrl.searchParams.get('preview') === params.type) {
		reqUrl.searchParams.delete('preview')
		throw redirect(reqUrl.toString())
	}
	const pathnameParam = reqUrl.searchParams.get('pathname')
	if (pathnameParam === '' || pathnameParam === '/') {
		reqUrl.searchParams.delete('pathname')
		throw redirect(reqUrl.toString())
	}

	const problemApp = await getExerciseApp(
		{ ...params, type: 'problem' },
		{ request, timings },
	).then(a => (isProblemApp(a) ? a : null))
	const solutionApp = await getExerciseApp(
		{ ...params, type: 'solution' },
		{ request, timings },
	).then(a => (isSolutionApp(a) ? a : null))

	if (!problemApp && !solutionApp) {
		throw new Response('Not found', { status: 404 })
	}

	const isProblemRunning =
		problemApp?.dev.type === 'script' ? isAppRunning(problemApp) : false
	const isSolutionRunning =
		solutionApp?.dev.type === 'script' ? isAppRunning(solutionApp) : false

	const app1Name = reqUrl.searchParams.get('app1')
	const app2Name = reqUrl.searchParams.get('app2')
	const app1 = app1Name
		? await getAppByName(app1Name)
		: params.type === 'solution'
		? solutionApp
		: problemApp
	const app2 = app2Name
		? await getAppByName(app2Name)
		: params.type === 'solution'
		? problemApp
		: solutionApp

	if (!app1 || !app2) {
		throw new Response('No app to compare to', { status: 404 })
	}

	const allApps = (await getApps({ request, timings }))
		.filter((a, i, ar) => ar.findIndex(b => a.name === b.name) === i)
		.map(a => ({
			displayName: isExerciseStepApp(a)
				? `${a.exerciseNumber}.${a.stepNumber} ${a.title} (${
						{ problem: '💪', solution: '🏁' }[a.type]
				  } ${a.type})`
				: `${a.title} (${a.type})`,
			name: a.name,
			title: a.title,
			type: a.type,
		}))

	const apps = await getApps({ request, timings })
	const exerciseApps = apps
		.filter(isExerciseStepApp)
		.filter(app => app.exerciseNumber === exerciseStepApp.exerciseNumber)
	const isLastStep =
		exerciseApps[exerciseApps.length - 1]?.id === exerciseStepApp.id
	const isFirstStep = exerciseApps[0]?.id === exerciseStepApp.id

	const nextApp = await getNextExerciseApp(exerciseStepApp, {
		request,
		timings,
	})
	const prevApp = await getPrevExerciseApp(exerciseStepApp, {
		request,
		timings,
	})

	const getDiffProp = async () => {
		return {
			allApps,
			app1: app1.name,
			app2: app2.name,
			diffCode: await getDiffCode(app1, app2, {
				request,
				timings,
			}).catch(e => {
				console.error(e)
				return null
			}),
		}
	}

	return defer(
		{
			type: params.type as 'problem' | 'solution',
			exerciseStepApp,
			exerciseTitle: exercise.title,
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
			problem: problemApp
				? {
						type: 'problem',
						id: problemApp.id,
						fullPath: problemApp.fullPath,
						isRunning: isProblemRunning,
						dev: problemApp.dev,
						test: problemApp.test,
						portIsAvailable:
							problemApp.dev.type === 'script'
								? isProblemRunning
									? null
									: await isPortAvailable(problemApp.dev.portNumber)
								: null,
						title: problemApp.title,
						name: problemApp.name,
				  }
				: null,
			solution: solutionApp
				? {
						type: 'solution',
						id: solutionApp.id,
						fullPath: solutionApp.fullPath,
						isRunning: isSolutionRunning,
						dev: solutionApp.dev,
						test: solutionApp.test,
						portIsAvailable:
							solutionApp.dev.type === 'script'
								? isSolutionRunning
									? null
									: await isPortAvailable(solutionApp.dev.portNumber)
								: null,
						title: solutionApp.title,
						name: solutionApp.name,
				  }
				: null,
			diff: getDiffProp(),
		} as const,
		{
			headers: {
				'Cache-Control': 'public, max-age=1',
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

const tabs = ['problem', 'solution', 'tests', 'diff'] as const
const isValidPreview = (s: string | null): s is (typeof tabs)[number] =>
	Boolean(s && tabs.includes(s as (typeof tabs)[number]))

const types = ['problem', 'solution'] as const
const isValidType = (s: string | undefined): s is (typeof types)[number] =>
	Boolean(s && types.includes(s as (typeof types)[number]))

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

function useHydrated() {
	const [hydrated, setHydrated] = useState(false)
	useEffect(() => {
		setHydrated(true)
	}, [])
	return hydrated
}

export default function ExercisePartRoute() {
	const data = useLoaderData<typeof loader>()
	const params = useParams()
	const [searchParams] = useSearchParams()

	const type = isValidType(params.type) ? params.type : null
	const preview = searchParams.get('preview')
	const activeTab = isValidPreview(preview) ? preview : type ? type : tabs[0]
	const activeApp = preview === 'solution' ? 'solution' : 'problem'
	const inBrowserBrowserRef = useRef<InBrowserBrowserRef>(null)
	const previewAppUrl = data[activeApp]?.dev.baseUrl

	const touchedFilesDivRef = useRef<HTMLDivElement>(null)
	const hydrated = useHydrated()
	const InlineFile = useMemo(() => {
		return function InlineFile({
			file,
			type = 'problem',
			children = <code>{file}</code>,
			...props
		}: PropsWithChildren<typeof LaunchEditor> & {
			file: string
			type?: 'solution' | 'problem'
		}) {
			const app = data[type]
			return app ? (
				<div className="inline-block">
					<LaunchEditor appFile={file} appName={app.name} {...props}>
						<div className="launch-editor-button-wrapper flex items-center justify-center underline">
							{children}{' '}
							<img
								title="Open in editor"
								alt="Open in editor"
								className="!m-0"
								src="/icons/keyboard-2.svg"
							/>
						</div>
					</LaunchEditor>
				</div>
			) : (
				<>children</>
			)
		}
	}, [data])

	// we want to move the TouchedFiles component to the end of the instructions
	// section, so we make a ref and portal to that. We also render a dummy-version
	// of the button on the server so that the layout doesn't jump when the
	// component is hydrated.
	const RefedTouchedFiles = useMemo(() => {
		return function RefedTouchedFiles({
			children,
		}: {
			children: React.ReactElement
		}) {
			const hydrated = useHydrated()
			return hydrated && touchedFilesDivRef.current
				? createPortal(
						<TouchedFiles>{children}</TouchedFiles>,
						touchedFilesDivRef.current,
				  )
				: null
		}
	}, [])

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
						{pageTitle(data)}
					</h4>
					<article className="shadow-on-scrollbox prose sm:prose-lg scrollbar-thin scrollbar-thumb-gray-200 prose-p:text-black prose-headings:text-black h-full w-full max-w-none space-y-6 overflow-y-auto p-14 pt-0 text-black">
						{data.exerciseStepApp.instructionsCode ? (
							<Mdx
								code={data.exerciseStepApp?.instructionsCode}
								components={{
									InlineFile,
									TouchedFiles: RefedTouchedFiles,
									LinkToApp,
								}}
							/>
						) : (
							<p>No instructions yet...</p>
						)}
					</article>
					<div className="flex h-16 justify-between border-t border-gray-200 bg-white">
						<div>
							{/* this is just here to make it so the button doesn't flash */}
							{hydrated ? null : touchedFilesButton}
							<div className="h-full" ref={touchedFilesDivRef} />
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
					// intentially no onValueChange here because the Link will trigger the
					// change.
				>
					<Tabs.List className="border-b border-gray-200">
						{tabs.map(tab => {
							return (
								<Tabs.Trigger
									key={tab}
									value={tab}
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
											type === tab ? null : tab,
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
							<Preview
								appInfo={data.problem}
								inBrowserBrowserRef={inBrowserBrowserRef}
							/>
						</Tabs.Content>
						<Tabs.Content
							value={tabs[1]}
							className="radix-state-inactive:hidden flex flex-grow items-center justify-center"
						>
							<Preview
								appInfo={data.solution}
								inBrowserBrowserRef={inBrowserBrowserRef}
							/>
						</Tabs.Content>
						<Tabs.Content
							value={tabs[2]}
							className="radix-state-inactive:hidden flex max-h-[calc(100vh-53px)] flex-grow items-start justify-center overflow-hidden"
						>
							<Tests
								appInfo={type === 'solution' ? data.solution : data.problem}
							/>
						</Tabs.Content>
						<Tabs.Content
							value={tabs[3]}
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
	appInfo: SerializeFrom<typeof loader>['problem' | 'solution']
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
			<div className="relative h-full flex-grow overflow-y-auto">
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

function Tests({
	appInfo,
}: {
	appInfo: SerializeFrom<typeof loader>['problem' | 'solution']
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
