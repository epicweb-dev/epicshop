import { Tab, TabList, TabPanel, TabPanels, Tabs } from '@reach/tabs'
import type { DataFunctionArgs } from '@remix-run/node'
import { json } from '@remix-run/node'
import { Link, useLoaderData, useMatches } from '@remix-run/react'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { InBrowserBrowser } from '~/components/in-browser-browser'
import { getExerciseApp } from '~/utils/misc.server'
import { isAppRunning, isPortAvailable } from '~/utils/process-manager.server'
import { isRouteErrorResponse, Outlet, useRouteError } from '@remix-run/react'
import invariant from 'tiny-invariant'
import { getErrorMessage } from '~/utils/misc'
import { getExercise } from '~/utils/misc.server'

export async function loader({ params }: DataFunctionArgs) {
	invariant(params.exerciseNumber, 'exerciseNumber is required')
	const exercise = await getExercise(params.exerciseNumber)
	if (!exercise) {
		throw new Response('Not found', { status: 404 })
	}
	const problemApp = await getExerciseApp({ ...params, type: 'problem' })
	const solutionApp = await getExerciseApp({ ...params, type: 'solution' })
	if (!problemApp && !solutionApp) {
		throw new Response('Not found', { status: 404 })
	}

	const isProblemRunning = problemApp ? isAppRunning(problemApp) : false
	const isSolutionRunning = solutionApp ? isAppRunning(solutionApp) : false

	return json({
		exerciseNumber: exercise.exerciseNumber,
		exerciseTitle: exercise.title,
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
	})
}

export default function StepRoute() {
	const data = useLoaderData<typeof loader>()
	const params = useParams()
	const matches = useMatches()
	const navigate = useNavigate()
	const isDiff = matches.find(
		m => m.id === 'routes/_app+/$exerciseNumber_.$stepNumber.diff',
	)
	const tabs = ['problem', 'solution', 'diff']
	const tabIndex = isDiff
		? 2
		: params.type && tabs.includes(params.type)
		? tabs.indexOf(params.type)
		: 0

	function handleTabChange(index: number) {
		const chosenTab = tabs[index]
		if (chosenTab) {
			navigate(chosenTab, { preventScrollReset: true })
		}
	}

	return (
		<div>
			<h1>
				<Link to={`/${data.exerciseNumber}`}>{data.exerciseTitle}</Link>
			</h1>
			<div className="grid grid-cols-2">
				{isDiff ? <p>You're looking at a diff</p> : <Outlet />}
				<Tabs index={tabIndex} onChange={handleTabChange}>
					<TabList>
						<Tab
							// Because we have a link right under the tab, we'll keep this off
							// the tab "tree" and rely on focusing/activating the link.
							tabIndex={-1}
						>
							{/*
						The link is here for progressive enhancement. Even though this
						is a tab, it's actually navigating to a route, so semantically
						it should be a link. By making it a link, it'll work with JS
						off, but more importantly it'll allow people to meta-click it.
					*/}
							<Link
								preventScrollReset
								prefetch="intent"
								to="problem"
								onClick={e => {
									if (e.metaKey) {
										e.stopPropagation()
									}
								}}
							>
								Problem
							</Link>
						</Tab>
						<Tab
							// Because we have a link right under the tab, we'll keep this off
							// the tab "tree" and rely on focusing/activating the link.
							tabIndex={-1}
						>
							{/*
						The link is here for progressive enhancement. Even though this
						is a tab, it's actually navigating to a route, so semantically
						it should be a link. By making it a link, it'll work with JS
						off, but more importantly it'll allow people to meta-click it.
					*/}
							<Link
								preventScrollReset
								prefetch="intent"
								to="solution"
								onClick={e => {
									if (e.metaKey) {
										e.stopPropagation()
									}
								}}
							>
								Solution
							</Link>
						</Tab>
						<Tab
							// Because we have a link right under the tab, we'll keep this off
							// the tab "tree" and rely on focusing/activating the link.
							tabIndex={-1}
						>
							{/*
						The link is here for progressive enhancement. Even though this
						is a tab, it's actually navigating to a route, so semantically
						it should be a link. By making it a link, it'll work with JS
						off, but more importantly it'll allow people to meta-click it.
					*/}
							<Link
								preventScrollReset
								prefetch="intent"
								to="diff"
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
							{tabIndex === 2 ? <Outlet /> : null}
						</TabPanel>
					</TabPanels>
				</Tabs>
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
			<p>Sorry, we couldn't find that step.</p>
		) : (
			<p>
				{error.status} {error.data}
			</p>
		)
	) : (
		<p>{getErrorMessage(error)}</p>
	)
}
