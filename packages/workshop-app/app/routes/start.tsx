import type { DataFunctionArgs } from '@remix-run/node'
import { defer, json, redirect } from '@remix-run/node'
import { useFetcher } from '@remix-run/react'
import invariant from 'tiny-invariant'
import {
	exec,
	getAppByName,
	getWorkshopRoot,
	isExerciseStepApp,
} from '~/utils/misc.server'
import {
	closeProcess,
	runAppDev,
	stopPort,
	waitOnApp,
} from '~/utils/process-manager.server'

export async function loader({ request }: DataFunctionArgs) {
	const name = new URL(request.url).searchParams.get('name')
	invariant(typeof name === 'string', 'name is required')
	const app = await getAppByName(name)
	if (!app) {
		throw new Response('Not found', { status: 404 })
	}
	if (app.dev.type !== 'script') {
		throw redirect(app.dev.baseUrl)
	}

	const result = await runAppDev(app)

	if (result.running) {
		return defer({
			title: app.title,
			port: app.dev.portNumber,
			vsCodeReady: exec(
				`code "${await getWorkshopRoot()}" "${app.fullPath}/README.md"`,
			),
			startStatus: result.status,
			appReady: waitOnApp(app).then(() => {
				if (isExerciseStepApp(app)) {
					return `/exercise/${app.exerciseNumber}`
				} else {
					return `/example/${app.name}`
				}
			}),
		})
	} else {
		return defer({
			title: app.title,
			port: app.dev.portNumber,
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
		const name = formData.get('name')
		invariant(typeof name === 'string', 'name is required')
		if (name.includes('..')) {
			throw redirect('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
		}
		const app = await getAppByName(name)
		if (!app) {
			throw new Response('Not found', { status: 404 })
		}
		if (app.dev.type !== 'script') {
			throw new Response(`App "${name}" does not have a server`, {
				status: 400,
			})
		}

		switch (intent) {
			case 'start': {
				const result = await runAppDev(app)
				if (result.running) {
					await waitOnApp(app)
					return json({ status: 'app-started' } as const)
				} else if (result.portNumber) {
					return json({
						status: 'app-not-started',
						error: result.status,
						port: result.portNumber,
					} as const)
				} else {
					throw new Response(
						'Tried starting a server for an app that does not have one',
						{ status: 400 },
					)
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

export function AppStopper({ name }: { name: string }) {
	const fetcher = useFetcher<typeof action>()
	return (
		<fetcher.Form method="post" action="/start">
			<input type="hidden" name="name" value={name} />
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

export function AppStarter({ name }: { name: string }) {
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
			<input type="hidden" name="name" value={name} />
			<button type="submit" name="intent" value="start">
				{fetcher.submission ? 'Starting App' : 'Start App'}
			</button>
		</fetcher.Form>
	)
}
