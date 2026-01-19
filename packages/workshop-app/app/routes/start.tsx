import { invariant, invariantResponse } from '@epic-web/invariant'
import { getAppByName } from '@epic-web/workshop-utils/apps.server'
import {
	closeProcess,
	runAppDev,
	stopPort,
	waitOnApp,
} from '@epic-web/workshop-utils/process-manager.server'
import { data, type ActionFunctionArgs } from 'react-router'
import { ensureUndeployed } from '#app/utils/misc.tsx'
import { dataWithPE } from '#app/utils/pe.tsx'
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

