import type { DataFunctionArgs } from '@remix-run/node'
import { json } from '@remix-run/node'
import { useFetcher } from '@remix-run/react'
import invariant from 'tiny-invariant'
import { Button } from '~/components/button.tsx'
import Loading from '~/components/loading.tsx'
import { getAppByName } from '~/utils/apps.server.ts'
import {
	closeProcess,
	runAppDev,
	stopPort,
	waitOnApp,
} from '~/utils/process-manager.server.ts'

export async function action({ request }: DataFunctionArgs) {
	const formData = await request.formData()
	const intent = formData.get('intent')
	invariant(typeof intent === 'string', 'intent is required')

	if (intent === 'start' || intent === 'stop') {
		const name = formData.get('name')
		invariant(typeof name === 'string', 'name is required')
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
					// wait another 200ms just in case the build output for assets isn't finished
					await new Promise(resolve => setTimeout(resolve, 200))
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
		<fetcher.Form method="POST" action="/start">
			<input type="hidden" name="name" value={name} />
			<button
				type="submit"
				name="intent"
				value="stop"
				className="h-full border-r border-gray-200 px-3 py-4 font-mono text-xs uppercase leading-none"
			>
				{fetcher.state === 'idle' ? 'Stop App' : 'Stopping App'}
			</button>
		</fetcher.Form>
	)
}

export function PortStopper({ port }: { port: number | string }) {
	const fetcher = useFetcher<typeof action>()

	return (
		<fetcher.Form method="POST" action="/start">
			<input type="hidden" name="port" value={port} />
			<Button varient="mono" type="submit" name="intent" value="stop-port">
				{fetcher.state === 'idle' ? 'Stop Port' : 'Stopping Port'}
			</Button>
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
		<fetcher.Form method="POST" action="/start">
			<input type="hidden" name="name" value={name} />
			{fetcher.state === 'idle' ? (
				<Button type="submit" name="intent" value="start" varient="mono">
					Start App
				</Button>
			) : (
				<div>
					<Loading>Starting App</Loading>
				</div>
			)}
		</fetcher.Form>
	)
}
