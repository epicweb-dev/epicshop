import type { DataFunctionArgs } from '@remix-run/node'
import { json } from '@remix-run/node'
import { redirect, defer } from '@remix-run/node'
import {
	Await,
	useAsyncError,
	useFetcher,
	useLoaderData,
	useNavigate,
} from '@remix-run/react'
import { Suspense, useEffect } from 'react'
import invariant from 'tiny-invariant'
import { getErrorMessage } from '~/utils/misc'
import {
	exec,
	getAppFromRelativePath,
	getWorkshopRoot,
	isExercisePartApp,
} from '~/utils/misc.server'
import {
	closeProcess,
	runAppDev,
	stopPort,
	waitOnApp,
} from '~/utils/process-manager.server'

export async function loader({ request }: DataFunctionArgs) {
	const relativePath = new URL(request.url).searchParams.get('relativePath')
	invariant(typeof relativePath === 'string', 'relativePath is required')
	if (relativePath.includes('..')) {
		throw redirect('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
	}
	const app = await getAppFromRelativePath(relativePath)
	if (!app) {
		throw new Response('Not found', { status: 404 })
	}

	const result = await runAppDev(app)

	if (result.running) {
		return defer({
			title: app.title,
			port: app.portNumber,
			vsCodeReady: exec(
				`code "${await getWorkshopRoot()}" "${app.fullPath}/README.md"`,
			),
			startStatus: result.status,
			appReady: waitOnApp(app).then(() => {
				if (isExercisePartApp(app)) {
					return `/exercise/${app.exerciseNumber}`
				} else {
					return `/example/${app.name}`
				}
			}),
		})
	} else {
		return defer({
			title: app.title,
			port: app.portNumber,
			vsCodeReady: exec(
				`code "${await getWorkshopRoot()}" "${app.fullPath}/README.md"`,
			),
			appReady: null,
			startStatus: result.status,
		})
	}
}

export async function action({ request }: DataFunctionArgs) {
	const formData = await request.formData()
	const intent = formData.get('intent')
	invariant(typeof intent === 'string', 'intent is required')

	if (intent === 'start' || intent === 'stop') {
		const relativePath = formData.get('relativePath')
		invariant(typeof relativePath === 'string', 'relativePath is required')
		if (relativePath.includes('..')) {
			throw redirect('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
		}
		const app = await getAppFromRelativePath(relativePath)
		if (!app) {
			throw new Response('Not found', { status: 404 })
		}

		switch (intent) {
			case 'start': {
				const result = await runAppDev(app)
				if (result.running) {
					await waitOnApp(app)
					return json({ status: 'app-started' } as const)
				} else {
					return json({
						status: 'app-not-started',
						error: result.status,
						port: result.portNumber,
					} as const)
				}
			}
			case 'stop': {
				await closeProcess(app.name)
				return json({ status: 'app-stopped' } as const)
			}
		}
	}

	if (intent === 'stop-port') {
		const port = formData.get('port')
		invariant(typeof port === 'string', 'port is required')
		await stopPort(port)
		return json({ status: 'port-stopped' } as const)
	}
	throw new Error(`Unknown intent: ${intent}`)
}

export function AppStopper({ relativePath }: { relativePath: string }) {
	const fetcher = useFetcher<typeof action>()
	return (
		<fetcher.Form method="post" action="/start">
			<input type="hidden" name="relativePath" value={relativePath} />
			<button type="submit" name="intent" value="stop">
				{fetcher.submission ? 'Stopping App' : 'Stop App'}
			</button>
		</fetcher.Form>
	)
}

export function PortStopper({ port }: { port: number | string }) {
	const fetcher = useFetcher<typeof action>()

	return (
		<fetcher.Form method="post" action="/start">
			<input type="hidden" name="port" value={port} />
			<button type="submit" name="intent" value="stop-port">
				{fetcher.submission ? 'Stopping Port' : 'Stop Port'}
			</button>
		</fetcher.Form>
	)
}

export function AppStarter({ relativePath }: { relativePath: string }) {
	const fetcher = useFetcher<typeof action>()
	if (fetcher.data?.status === 'app-not-started') {
		if (fetcher.data.error === 'port-unavailable') {
			return (
				<div>
					The port is unavailable. Would you like to stop whatever is running on
					that port and try again?
					<PortStopper port={fetcher.data.port} />
				</div>
			)
		} else {
			return <div>An unknown error has happened.</div>
		}
	}
	return (
		<fetcher.Form method="post" action="/start">
			<input type="hidden" name="relativePath" value={relativePath} />
			<button type="submit" name="intent" value="start">
				{fetcher.submission ? 'Starting App' : 'Start App'}
			</button>
		</fetcher.Form>
	)
}

export default function StartWaiter() {
	const data = useLoaderData<typeof loader>()
	const navigate = useNavigate()

	useEffect(() => {
		let current = true
		data.appReady?.then(pathname => {
			if (current) {
				navigate(pathname)
			}
		})
		return () => {
			current = false
		}
	}, [data.appReady, navigate])

	return (
		<div>
			{data.startStatus === 'port-unavailable' ? (
				<div>
					<h1>Port {data.port} is unavailable</h1>
					<p>
						If you would like to stop that port and try again, click the button:
					</p>
					<PortStopper port={data.port} />
					<div>
						Something else is running on the same port as the app you wanted to
						start. This can happen for a variaty of reasons:
						<ul>
							<li>The process failed to exit properly</li>
							<li>You started it another way</li>
							<li>Something else has taken the port</li>
						</ul>
					</div>
				</div>
			) : (
				<Suspense
					fallback={
						<h1>
							Starting {data.title} on port {data.port}...
						</h1>
					}
				>
					<Await resolve={data.appReady} errorElement={<ErrorFallback />}>
						{() => <h1>Ready! Redirecting...</h1>}
					</Await>
				</Suspense>
			)}
			<Suspense fallback={<h1>Opening VS Code...</h1>}>
				<Await resolve={data.vsCodeReady} errorElement={<ErrorFallback />}>
					{() => <h1>VS Code ready!</h1>}
				</Await>
			</Suspense>
		</div>
	)
}

function ErrorFallback() {
	const error = useAsyncError()

	return (
		<div>
			<div>
				Whoops! Sorry, there was an error{' '}
				<span role="img" aria-label="grimace">
					😬
				</span>
			</div>
			<hr className="my-2" />
			<pre className="whitespace-pre-wrap">{getErrorMessage(error)}</pre>
		</div>
	)
}
