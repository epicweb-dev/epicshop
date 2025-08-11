import { json, type ActionFunctionArgs } from 'react-router'
import { z } from 'zod'
import { forkApp } from '@epic-web/workshop-utils/apps.server'
import { makeTimings } from '@epic-web/workshop-utils/timing.server'
import { ensureUndeployed } from '#app/utils/misc.tsx'
import { resolveApps } from './__utils'

const ForkSchema = z.object({
	newAppName: z.string().min(1, 'App name is required'),
})

export async function action({ request, params }: ActionFunctionArgs) {
	ensureUndeployed()
	
	if (request.method !== 'POST') {
		return json({ error: 'Method not allowed' }, { status: 405 })
	}

	try {
		const formData = await request.formData()
		const data = ForkSchema.parse({
			newAppName: formData.get('newAppName'),
		})

		const timings = makeTimings('fork-app')
		const { app } = await resolveApps({ request, params, timings })
		
		if (!app) {
			return json({ error: 'App not found' }, { status: 404 })
		}

		const forkedApp = await forkApp(app.name, data.newAppName, { request, timings })

		return json({
			success: true,
			message: `App "${app.name}" forked to "${data.newAppName}"`,
			forkedApp: {
				name: forkedApp.name,
				title: forkedApp.title,
				pathname: forkedApp.dev.type === 'browser' ? forkedApp.dev.pathname : null,
			},
		})
	} catch (error) {
		if (error instanceof z.ZodError) {
			return json({ error: error.errors[0]?.message || 'Validation failed' }, { status: 400 })
		}
		
		if (error instanceof Error) {
			return json({ error: error.message }, { status: 400 })
		}
		
		return json({ error: 'An unexpected error occurred' }, { status: 500 })
	}
}