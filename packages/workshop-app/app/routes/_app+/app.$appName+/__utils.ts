import { invariantResponse } from '@epic-web/invariant'
import { getAppByName, getApps } from '@epic-web/workshop-utils/apps.server'
import { type Timings } from '@epic-web/workshop-utils/timing.server'
import { type Params } from '@remix-run/react'

export async function resolveApps({
	request,
	params,
	timings,
}: {
	request: Request
	params: Params
	timings: Timings
}) {
	const url = new URL(request.url)
	const { appName } = params

	invariantResponse(appName, 'appName param required')
	const app = await getAppByName(appName, { request, timings })

	const fileAppName = url.searchParams.get('fileAppName')
	if (fileAppName) {
		const apps = await getApps({ request, timings })
		const fileApp = fileAppName
			? apps.find((app) => app.name === fileAppName)
			: app
		return { app, fileApp }
	} else {
		return { app, fileApp: app }
	}
}
