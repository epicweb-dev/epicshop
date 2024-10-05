import {
	getAppByName,
	getAppDisplayName,
	getApps,
	getExerciseApp,
	isExerciseStepApp,
	isPlaygroundApp,
	requireExerciseApp,
	type App,
	type ExerciseStepApp,
} from '@epic-web/workshop-utils/apps.server'
import { compileMarkdownString } from '@epic-web/workshop-utils/compile-mdx.server'
import {
	combineServerTimings,
	getServerTimeHeader,
	makeTimings,
} from '@epic-web/workshop-utils/timing.server'
import * as Tabs from '@radix-ui/react-tabs'
import {
	defer,
	redirect,
	type HeadersFunction,
	type LoaderFunctionArgs,
} from '@remix-run/node'
import {
	Link,
	useLoaderData,
	useNavigate,
	useSearchParams,
} from '@remix-run/react'
import { clsx } from 'clsx'
import * as React from 'react'
import { useRef } from 'react'
import { Diff } from '#app/components/diff.tsx'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { type InBrowserBrowserRef } from '#app/components/in-browser-browser.tsx'
import { getDiscordAuthURL } from '#app/routes/discord.callback.ts'
import { getDiffCode } from '#app/utils/diff.server.ts'
import { userHasAccessToWorkshop } from '#app/utils/epic-api.js'
import { useAltDown } from '#app/utils/misc.tsx'
import { fetchDiscordPosts } from './__shared/discord.server.ts'
import { DiscordChat } from './__shared/discord.tsx'
import { Playground } from './__shared/playground.tsx'
import { Preview } from './__shared/preview.tsx'
import { Tests } from './__shared/tests.tsx'
import { getAppRunningState } from './__shared/utils.tsx'

export async function loader({ request, params }: LoaderFunctionArgs) {
	const timings = makeTimings('exerciseStepTypeIndexLoader')
	const userHasAccess = await userHasAccessToWorkshop({
		request,
		timings,
	})
	const searchParams = new URL(request.url).searchParams
	const cacheOptions = { request, timings }
	const exerciseStepApp = await requireExerciseApp(params, cacheOptions)
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

	async function getDiffProp() {
		if (!app1 || !app2) {
			return {
				app1: app1?.name,
				app2: app2?.name,
				diffCode: null,
			}
		}
		if (!userHasAccess) {
			return {
				app1: app1?.name,
				app2: app2?.name,
				diffCode: await compileMarkdownString(
					`<h1>Access Denied</h1><p>You must login or register for the workshop to view the diff</p>`,
				),
			}
		}
		const diffCode = await getDiffCode(app1, app2, {
			...cacheOptions,
			forceFresh: searchParams.get('forceFresh') === 'diff',
		}).catch((e) => {
			console.error(e)
			return null
		})
		return {
			app1: app1.name,
			app2: app2.name,
			diffCode,
		}
	}

	return defer(
		{
			type: params.type as 'problem' | 'solution',
			exerciseStepApp,
			allApps,
			discordAuthUrl: getDiscordAuthURL(),
			// defer this promise so that we don't block the response from being sent
			discordPostsPromise: fetchDiscordPosts({ request }),
			playground: playgroundApp
				? ({
						type: 'playground',
						fullPath: playgroundApp.fullPath,
						dev: playgroundApp.dev,
						test: playgroundApp.test,
						title: playgroundApp.title,
						name: playgroundApp.name,
						appName: playgroundApp.appName,
						isUpToDate: playgroundApp.isUpToDate,
						stackBlitzUrl: playgroundApp.stackBlitzUrl,
						...(await getAppRunningState(playgroundApp)),
					} as const)
				: null,
			problem: problemApp
				? ({
						type: 'problem',
						fullPath: problemApp.fullPath,
						dev: problemApp.dev,
						test: problemApp.test,
						title: problemApp.title,
						name: problemApp.name,
						stackBlitzUrl: problemApp.stackBlitzUrl,
						...(await getAppRunningState(problemApp)),
					} as const)
				: null,
			solution: solutionApp
				? ({
						type: 'solution',
						fullPath: solutionApp.fullPath,
						dev: solutionApp.dev,
						test: solutionApp.test,
						title: solutionApp.title,
						name: solutionApp.name,
						stackBlitzUrl: solutionApp.stackBlitzUrl,
						...(await getAppRunningState(solutionApp)),
					} as const)
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

const tabs = [
	'playground',
	'problem',
	'solution',
	'tests',
	'diff',
	'chat',
] as const
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
	const inBrowserBrowserRef = useRef<InBrowserBrowserRef>(null)

	const altDown = useAltDown()
	const navigate = useNavigate()

	function shouldHideTab(tab: (typeof tabs)[number]) {
		if (tab === 'tests') {
			return (
				ENV.EPICSHOP_DEPLOYED ||
				!data.playground ||
				data.playground.test.type === 'none'
			)
		}
		if (tab === 'problem' || tab === 'solution') {
			if (data[tab]?.dev.type === 'none') return true
			if (ENV.EPICSHOP_DEPLOYED) {
				return data[tab]?.dev.type !== 'browser' && !data[tab]?.stackBlitzUrl
			}
		}
		if (tab === 'playground' && ENV.EPICSHOP_DEPLOYED) return true
		return false
	}

	const activeTab = isValidPreview(preview)
		? preview
		: tabs.find((t) => !shouldHideTab(t))

	// when alt is held down, the diff tab should open to the full-page diff view
	// between the problem and solution (this is more for the instructor than the student)
	const altDiffUrl = `/diff?${new URLSearchParams({
		app1: data.problem?.name ?? '',
		app2: data.solution?.name ?? '',
	})}`

	function handleDiffTabClick(event: React.MouseEvent<HTMLAnchorElement>) {
		if (event.altKey && !event.ctrlKey && !event.shiftKey && !event.metaKey) {
			event.preventDefault()
			navigate(altDiffUrl)
		}
	}

	return (
		<Tabs.Root
			className="relative flex flex-col overflow-y-auto sm:col-span-1 sm:row-span-1"
			value={activeTab}
			// intentionally no onValueChange here because the Link will trigger the
			// change.
		>
			<Tabs.List className="h-14 min-h-14 overflow-x-hidden border-b scrollbar-thin scrollbar-thumb-scrollbar">
				{tabs.map((tab) => {
					const hidden = shouldHideTab(tab)
					return (
						<Tabs.Trigger key={tab} value={tab} hidden={hidden} asChild>
							<Link
								id={`${tab}-tab`}
								className={clsx(
									'clip-path-button relative h-full px-6 py-4 font-mono text-sm uppercase outline-none radix-state-active:z-10 radix-state-active:bg-foreground radix-state-active:text-background radix-state-active:hover:bg-foreground/80 radix-state-active:hover:text-background/80 radix-state-inactive:hover:bg-foreground/20 radix-state-inactive:hover:text-foreground/80 focus:bg-foreground/80 focus:text-background/80',
									hidden ? 'hidden' : 'inline-block',
								)}
								preventScrollReset
								prefetch="intent"
								onClick={handleDiffTabClick}
								to={
									tab === 'diff' && altDown
										? altDiffUrl
										: `?${withParam(
												searchParams,
												'preview',
												tab === 'playground' ? null : tab,
											)}`
								}
							>
								{tab}
							</Link>
						</Tabs.Trigger>
					)
				})}
			</Tabs.List>
			<div className="relative z-10 flex min-h-96 flex-grow flex-col overflow-y-auto">
				<Tabs.Content
					value="playground"
					className="flex w-full flex-grow items-center justify-center self-start radix-state-inactive:hidden"
				>
					<Playground
						appInfo={data.playground}
						problemAppName={data.problem?.name}
						inBrowserBrowserRef={inBrowserBrowserRef}
						allApps={data.allApps}
						isUpToDate={data.playground?.isUpToDate ?? false}
					/>
				</Tabs.Content>
				<Tabs.Content
					value="problem"
					className="flex w-full flex-grow items-center justify-center self-start radix-state-inactive:hidden"
				>
					<Preview
						appInfo={data.problem}
						inBrowserBrowserRef={inBrowserBrowserRef}
					/>
				</Tabs.Content>
				<Tabs.Content
					value="solution"
					className="flex w-full flex-grow items-center justify-center self-start radix-state-inactive:hidden"
				>
					<Preview
						appInfo={data.solution}
						inBrowserBrowserRef={inBrowserBrowserRef}
					/>
				</Tabs.Content>
				<Tabs.Content
					value="tests"
					className="flex w-full flex-grow items-start justify-center self-start overflow-hidden radix-state-inactive:hidden"
				>
					<Tests
						appInfo={data.playground}
						problemAppName={data.problem?.name}
						allApps={data.allApps}
						isUpToDate={data.playground?.isUpToDate ?? false}
					/>
				</Tabs.Content>
				<Tabs.Content
					value="diff"
					className="flex h-full w-full flex-grow items-start justify-center self-start radix-state-inactive:hidden"
				>
					<Diff diff={data.diff} allApps={data.allApps} />
				</Tabs.Content>
				<Tabs.Content
					value="chat"
					className="flex h-full w-full flex-grow items-start justify-center self-start radix-state-inactive:hidden"
				>
					<DiscordChat />
				</Tabs.Content>
			</div>
		</Tabs.Root>
	)
}

export function ErrorBoundary() {
	return (
		<GeneralErrorBoundary
			statusHandlers={{
				404: () => <p>Sorry, we couldn't find an app here.</p>,
			}}
		/>
	)
}
