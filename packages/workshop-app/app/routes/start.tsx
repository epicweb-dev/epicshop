import { invariant, invariantResponse } from '@epic-web/invariant'
import { getAppByName } from '@epic-web/workshop-utils/apps.server'
import {
	closeProcess,
	runAppDev,
	stopPort,
	waitOnApp,
} from '@epic-web/workshop-utils/process-manager.server'
import { data, type ActionFunctionArgs, useFetcher } from 'react-router'
import { Button } from '#app/components/button.tsx'
import { Loading } from '#app/components/loading.tsx'
import { showProgressBarField } from '#app/components/progress-bar.tsx'
import { ensureUndeployed, useAltDown } from '#app/utils/misc.tsx'
import { dataWithPE, usePERedirectInput } from '#app/utils/pe.tsx'
import { createToastHeaders } from '#app/utils/toast.server'

export async function action({ request }: ActionFunctionArgs) {
	ensureUndeployed()
	const formData = await request.formData()
	const intent = formData.get('intent')
	invariantResponse(typeof intent === 'string', 'intent is required')

	if (intent === 'start' || intent === 'stop' || intent === 'restart') {
		const name = formData.get('name')
		invariantResponse(typeof name === 'string', 'name is required')
		const app = await getAppByName(name)
		if (!app) {
			throw new Response('Not found', { status: 404 })
		}
		if (app.dev.type !== 'script') {
			throw new Response(`App "${name}" does not have a server`, {
				status: 400,
			})
		}

		async function startApp() {
			invariant(app, 'app must be defined')
			const result = await runAppDev(app)
			if (result.running) {
				const appRunningResult = await waitOnApp(app)
				if (appRunningResult?.status === 'success') {
					// wait another 200ms just in case the build output for assets isn't finished
					await new Promise((resolve) => setTimeout(resolve, 200))
					return dataWithPE(request, formData, {
						status: 'app-started',
					} as const)
				} else if (app.dev.type === 'script') {
					const errorMessage = appRunningResult
						? appRunningResult.error
						: 'Unknown error'
					return data(
						{
							status: 'app-not-started',
							error: errorMessage,
							port: app.dev.portNumber,
						} as const,
						{
							status: 500,
							statusText: 'App did not start',
							headers: await createToastHeaders({
								description: errorMessage,
								title: 'App did not start',
								type: 'error',
							}),
						},
					)
				}
			} else if (result.portNumber) {
				return dataWithPE(request, formData, {
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

		async function stopApp() {
			invariant(app, 'app must be defined')
			await closeProcess(app.name)
			return dataWithPE(request, formData, { status: 'app-stopped' } as const)
		}

		switch (intent) {
			case 'start': {
				return startApp()
			}
			case 'stop': {
				return stopApp()
			}
			case 'restart': {
				await stopApp()
				return startApp()
			}
		}
	}

	if (intent === 'stop-port') {
		const port = formData.get('port')
		invariantResponse(typeof port === 'string', 'port is required')
		await stopPort(port)
		return dataWithPE(request, formData, { status: 'port-stopped' } as const)
	}
	throw new Error(`Unknown intent: ${intent}`)
}

export function AppStopper({ name }: { name: string }) {
	const fetcher = useFetcher<typeof action>()
	const peRedirectInput = usePERedirectInput()
	const inFlightIntent = fetcher.formData?.get('intent')
	const inFlightState =
		inFlightIntent === 'stop'
			? 'Stopping App'
			: inFlightIntent === 'restart'
				? 'Restarting App'
				: null
	const altDown = useAltDown()
	return (
		<fetcher.Form method="POST" action="/start">
			{peRedirectInput}
			{showProgressBarField}
			<input type="hidden" name="name" value={name} />
			<button
				type="submit"
				name="intent"
				value={altDown ? 'restart' : 'stop'}
				className="h-full border-r px-3 py-4 font-mono text-xs leading-none uppercase"
			>
				{inFlightState ? inFlightState : altDown ? 'Restart App' : 'Stop App'}
			</button>
		</fetcher.Form>
	)
}

export function PortStopper({ port }: { port: number | string }) {
	const fetcher = useFetcher<typeof action>()
	const peRedirectInput = usePERedirectInput()
	return (
		<fetcher.Form method="POST" action="/start">
			{peRedirectInput}
			{showProgressBarField}
			<input type="hidden" name="port" value={port} />
			<Button varient="mono" type="submit" name="intent" value="stop-port">
				{fetcher.state === 'idle' ? 'Stop Port' : 'Stopping Port'}
			</Button>
		</fetcher.Form>
	)
}

export function AppStarter({ name }: { name: string }) {
	const fetcher = useFetcher<typeof action>()
	const peRedirectInput = usePERedirectInput()
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
			{peRedirectInput}
			{showProgressBarField}
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
