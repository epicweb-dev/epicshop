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
import { getDiffCode } from '@epic-web/workshop-utils/diff.server'
import { userHasAccessToExerciseStep } from '@epic-web/workshop-utils/epic-api.server'
import {
	combineServerTimings,
	getServerTimeHeader,
	makeTimings,
} from '@epic-web/workshop-utils/timing.server'
import * as Tabs from '@radix-ui/react-tabs'
import { clsx } from 'clsx'
import * as React from 'react'
import { useRef } from 'react'
import {
	Link,
	useNavigate,
	useSearchParams,
	data,
	redirect,
	type HeadersFunction,
	type LoaderFunctionArgs,
} from 'react-router'
import { Diff } from '#app/components/diff.tsx'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { type InBrowserBrowserRef } from '#app/components/in-browser-browser.tsx'
import { StatusIndicator } from '#app/components/status-indicator.tsx'
import { useWorkshopConfig } from '#app/components/workshop-config.tsx'
import { useAltDown } from '#app/utils/misc.tsx'
import { type Route } from './+types/index.ts'
import { fetchDiscordPosts } from './__shared/discord.server.ts'
import { DiscordChat } from './__shared/discord.tsx'
import { Playground } from './__shared/playground.tsx'
import { Preview } from './__shared/preview.tsx'
import { Tests } from './__shared/tests.tsx'
import { getAppRunningState, getTestState } from './__shared/utils.tsx'

export async function loader({ request, params }: LoaderFunctionArgs) {
	const timings = makeTimings('exerciseStepTypeIndexLoader')
	const searchParams = new URL(request.url).searchParams
	const cacheOptions = { request, timings }

	const [exerciseStepApp, allAppsFull, problemApp, solutionApp] =
		await Promise.all([
			requireExerciseApp(params, cacheOptions),
			getApps(cacheOptions),
			getExerciseApp({ ...params, type: 'problem' }, cacheOptions),
			getExerciseApp({ ...params, type: 'solution' }, cacheOptions),
		])

	const playgroundApp = allAppsFull.find(isPlaygroundApp)
	const reqUrl = new URL(request.url)

	const pathnameParam = reqUrl.searchParams.get('pathname')
	if (pathnameParam === '' || pathnameParam === '/') {
		reqUrl.searchParams.delete('pathname')
		throw redirect(reqUrl.toString())
	}

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

	return data(
		{
			type: params.type as 'problem' | 'solution',
			exerciseStepApp,
			allApps,
			// defer this promise so that we don't block the response from being sent
			discordPostsPromise: fetchDiscordPosts({ request }),
			userHasAccessPromise: userHasAccessToExerciseStep({
				exerciseNumber: Number(params.exerciseNumber),
				stepNumber: Number(params.stepNumber),
				request,
				timings,
			}),
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
						...getTestState(playgroundApp),
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

export default function ExercisePartRoute({
	loaderData,
}: Route.ComponentProps) {
	const workshopConfig = useWorkshopConfig()
	const [searchParams] = useSearchParams()

	const preview = searchParams.get('preview')
	const inBrowserBrowserRef = useRef<InBrowserBrowserRef>(null)

	const altDown = useAltDown()
	const navigate = useNavigate()

	function shouldHideTab(tab: (typeof tabs)[number]) {
		if (tab === 'tests') {
			return (
				ENV.EPICSHOP_DEPLOYED ||
				!loaderData.playground ||
				loaderData.playground.test.type === 'none'
			)
		}
		if (tab === 'problem' || tab === 'solution') {
			if (loaderData[tab]?.dev.type === 'none') return true
			if (ENV.EPICSHOP_DEPLOYED) {
				return (
					loaderData[tab]?.dev.type !== 'browser' &&
					!loaderData[tab]?.stackBlitzUrl
				)
			}
		}
		if (tab === 'playground' && ENV.EPICSHOP_DEPLOYED) return true

		if (tab === 'chat') {
			return !workshopConfig.product.discordChannelId
		}
		return false
	}

	function getTabStatus(
		tab: (typeof tabs)[number],
	): 'running' | 'passed' | 'failed' | null {
		if (tab === 'tests') {
			if (!loaderData.playground) return null
			const { isTestRunning, testExitCode } = loaderData.playground
			if (isTestRunning) return 'running'
			if (testExitCode === 0) return 'passed'
			if (testExitCode !== null && testExitCode !== 0) return 'failed'
			return null
		}
		if (tab === 'problem' || tab === 'solution' || tab === 'playground') {
			const appData =
				tab === 'playground' ? loaderData.playground : loaderData[tab]
			if (appData?.isRunning) return 'running'
		}
		return null
	}

	const activeTab = isValidPreview(preview)
		? preview
		: tabs.find((t) => !shouldHideTab(t))

	// when alt is held down, the diff tab should open to the full-page diff view
	// between the problem and solution (this is more for the instructor than the student)
	const altDiffUrl = `/diff?${new URLSearchParams({
		app1: loaderData.problem?.name ?? '',
		app2: loaderData.solution?.name ?? '',
	})}`

	function handleDiffTabClick(event: React.MouseEvent<HTMLAnchorElement>) {
		if (event.altKey && !event.ctrlKey && !event.shiftKey && !event.metaKey) {
			event.preventDefault()
			void navigate(altDiffUrl)
		}
	}

	return (
		<Tabs.Root
			className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden sm:col-span-1 sm:row-span-1"
			value={activeTab}
			// intentionally no onValueChange here because the Link will trigger the
			// change.
		>
			<Tabs.List className="h-14 min-h-14 overflow-x-auto whitespace-nowrap border-b scrollbar-thin scrollbar-thumb-scrollbar">
				{tabs.map((tab) => {
					const hidden = shouldHideTab(tab)
					const status = getTabStatus(tab)
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
								<span className="flex items-center gap-2">
									{status && <StatusIndicator status={status} />}
									<span>{tab}</span>
								</span>
							</Link>
						</Tabs.Trigger>
					)
				})}
			</Tabs.List>
			<div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden">
				<Tabs.Content
					value="playground"
					className="flex min-h-0 w-full grow basis-0 items-stretch justify-center self-start radix-state-inactive:hidden"
					forceMount
				>
					<Playground
						appInfo={loaderData.playground}
						problemAppName={loaderData.problem?.name}
						inBrowserBrowserRef={inBrowserBrowserRef}
						allApps={loaderData.allApps}
						isUpToDate={loaderData.playground?.isUpToDate ?? false}
					/>
				</Tabs.Content>
				<Tabs.Content
					value="problem"
					className="flex min-h-0 w-full grow basis-0 items-stretch justify-center self-start radix-state-inactive:hidden"
					forceMount
				>
					<Preview
						appInfo={loaderData.problem}
						inBrowserBrowserRef={inBrowserBrowserRef}
					/>
				</Tabs.Content>
				<Tabs.Content
					value="solution"
					className="flex min-h-0 w-full grow basis-0 items-stretch justify-center self-start radix-state-inactive:hidden"
					forceMount
				>
					<Preview
						appInfo={loaderData.solution}
						inBrowserBrowserRef={inBrowserBrowserRef}
					/>
				</Tabs.Content>
				<Tabs.Content
					value="tests"
					className="flex min-h-0 w-full grow basis-0 items-stretch justify-center self-start overflow-hidden radix-state-inactive:hidden"
				>
					<Tests
						appInfo={loaderData.playground}
						problemAppName={loaderData.problem?.name}
						allApps={loaderData.allApps}
						isUpToDate={loaderData.playground?.isUpToDate ?? false}
						userHasAccessPromise={loaderData.userHasAccessPromise}
					/>
				</Tabs.Content>
				<Tabs.Content
					value="diff"
					className="flex h-full min-h-0 w-full grow basis-0 items-stretch justify-center self-start radix-state-inactive:hidden"
				>
					<Diff
						diff={loaderData.diff}
						allApps={loaderData.allApps}
						userHasAccessPromise={loaderData.userHasAccessPromise}
					/>
				</Tabs.Content>
				<Tabs.Content
					value="chat"
					className="flex h-full min-h-0 w-full grow basis-0 items-stretch justify-center self-start radix-state-inactive:hidden"
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
