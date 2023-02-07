import { isRouteErrorResponse, Link, useRouteError } from '@remix-run/react'
import { getErrorMessage } from '~/utils/misc'

import type { DataFunctionArgs } from '@remix-run/node'
import { json, redirect } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { getDiffCode } from '~/utils/diff.server'
import { Mdx } from '~/utils/mdx'
import {
	getAppByName,
	getAppPateRoute,
	getApps,
	getExerciseApp,
	getNextExerciseApp,
	getPrevExerciseApp,
	requireExerciseApp,
} from '~/utils/misc.server'
import { isAppRunning, isPortAvailable } from '~/utils/process-manager.server'

import { Tab, TabList, TabPanel, TabPanels, Tabs } from '@reach/tabs'
import { useSearchParams } from '@remix-run/react'
import { useParams } from 'react-router'
import { InBrowserBrowser } from '~/components/in-browser-browser'

export async function loader({ request, params }: DataFunctionArgs) {
	const exerciseStepApp = await requireExerciseApp(params)
	const reqUrl = new URL(request.url)

	// delete the preview if it's the same as the type
	if (reqUrl.searchParams.get('preview') === params.type) {
		reqUrl.searchParams.delete('preview')
		throw redirect(reqUrl.toString())
	}

	const problemApp = await getExerciseApp({ ...params, type: 'problem' })
	const solutionApp = await getExerciseApp({ ...params, type: 'solution' })
	if (!problemApp && !solutionApp) {
		throw new Response('Not found', { status: 404 })
	}

	const isProblemRunning = problemApp ? isAppRunning(problemApp) : false
	const isSolutionRunning = solutionApp ? isAppRunning(solutionApp) : false

	const app1Name = reqUrl.searchParams.get('app1')
	const app2Name = reqUrl.searchParams.get('app2')
	const app1 = app1Name ? await getAppByName(app1Name) : problemApp
	const app2 = app2Name ? await getAppByName(app2Name) : solutionApp

	if (!app1 || !app2) {
		throw new Response('No app to compare to', { status: 404 })
	}

	const allApps = (await getApps()).map(a => ({
		name: a.name,
		title: a.title,
	}))

	const nextApp = await getNextExerciseApp(exerciseStepApp)
	const prevApp = await getPrevExerciseApp(exerciseStepApp)
	const nextStepLink = nextApp
		? {
				to: getAppPateRoute(nextApp),
				children: `${nextApp.title} (${nextApp.type}) ➡️`,
		  }
		: null
	const prevStepLink = prevApp
		? {
				to: getAppPateRoute(prevApp),
				children: `⬅️ ${prevApp.title} (${prevApp.type})`,
		  }
		: null

	return json({
		type: params.type as 'problem' | 'solution',
		exerciseStepApp,
		prevStepLink,
		nextStepLink,
		problem: problemApp
			? {
					isRunning: isProblemRunning,
					portIsAvailable: isProblemRunning
						? null
						: await isPortAvailable(problemApp.portNumber),
					title: problemApp.title,
					name: problemApp.name,
					port: problemApp.portNumber,
			  }
			: null,
		solution: solutionApp
			? {
					isRunning: isSolutionRunning,
					portIsAvailable: isSolutionRunning
						? null
						: await isPortAvailable(solutionApp.portNumber),
					title: solutionApp.title,
					name: solutionApp.name,
					port: solutionApp.portNumber,
			  }
			: null,
		diff: {
			// TODO: decide if we need this...
			allApps,
			app1: app1.name,
			app2: app2.name,
			diffCode: await getDiffCode(app1, app2),
		},
	} as const)
}

const tabs = ['problem', 'solution', 'diff'] as const
const isValidPreview = (s: string | null): s is typeof tabs[number] =>
	Boolean(s && tabs.includes(s as typeof tabs[number]))

const types = ['problem', 'solution'] as const
const isValidType = (s: string | undefined): s is typeof types[number] =>
	Boolean(s && types.includes(s as typeof types[number]))

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
	const [searchParams, setSearchParams] = useSearchParams()
	const params = useParams()

	const type = isValidType(params.type) ? params.type : null

	const preview = searchParams.get('preview')
	const tabIndex = isValidPreview(preview)
		? tabs.indexOf(preview)
		: type
		? tabs.indexOf(type)
		: 0

	function handleTabChange(index: number) {
		const chosenTab = tabs[index]
		if (chosenTab) {
			setSearchParams({ preview: chosenTab }, { preventScrollReset: true })
		}
	}

	return (
		<div>
			<div className="grid grid-cols-2">
				<div className="prose overflow-y-scroll">
					{data.exerciseStepApp.instructionsCode ? (
						<Mdx code={data.exerciseStepApp?.instructionsCode} />
					) : (
						<p>No instructions yet...</p>
					)}
				</div>
				<Tabs index={tabIndex} onChange={handleTabChange}>
					<TabList>
						<Tab tabIndex={-1}>
							<Link
								preventScrollReset
								prefetch="intent"
								to={`?${withParam(
									searchParams,
									'preview',
									type === 'problem' ? null : 'problem',
								)}`}
								onClick={e => {
									if (e.metaKey) {
										e.stopPropagation()
									}
								}}
							>
								Problem
							</Link>
						</Tab>
						<Tab tabIndex={-1}>
							<Link
								preventScrollReset
								prefetch="intent"
								to={`?${withParam(
									searchParams,
									'preview',
									type === 'solution' ? null : 'solution',
								)}`}
								onClick={e => {
									if (e.metaKey) {
										e.stopPropagation()
									}
								}}
							>
								Solution
							</Link>
						</Tab>
						<Tab tabIndex={-1}>
							<Link
								preventScrollReset
								prefetch="intent"
								to={`?${withParam(searchParams, 'preview', 'diff')}`}
								onClick={e => {
									if (e.metaKey) {
										e.stopPropagation()
									}
								}}
							>
								Diff
							</Link>
						</Tab>
					</TabList>

					<TabPanels>
						<TabPanel hidden={tabIndex !== 0}>
							{data.problem ? (
								<InBrowserBrowser {...data.problem} />
							) : (
								<p>No problem app here. Sorry.</p>
							)}
						</TabPanel>
						<TabPanel hidden={tabIndex !== 1}>
							{data.solution ? (
								<InBrowserBrowser {...data.solution} />
							) : (
								<p>No solution app here. Sorry.</p>
							)}
						</TabPanel>
						<TabPanel hidden={tabIndex !== 2}>
							<div>
								<div className="prose whitespace-pre-wrap">
									<Mdx code={data.diff.diffCode} />
								</div>
								<pre>{JSON.stringify(data, null, 2)}</pre>
							</div>
						</TabPanel>
					</TabPanels>
				</Tabs>
			</div>

			<div className="flex justify-around">
				{data.prevStepLink ? (
					<Link
						prefetch="intent"
						className="text-blue-700 underline"
						to={data.prevStepLink.to}
						children={data.prevStepLink.children}
					/>
				) : null}
				{data.nextStepLink ? (
					<Link
						prefetch="intent"
						className="text-blue-700 underline"
						to={data.nextStepLink.to}
						children={data.nextStepLink.children}
					/>
				) : null}
			</div>
		</div>
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
