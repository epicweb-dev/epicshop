import { invariantResponse } from '@epic-web/invariant'
import {
	getAppByName,
	getApps,
	isPlaygroundApp,
	isProblemApp,
} from '@epic-web/workshop-utils/apps.server'
import { type Timings } from '@epic-web/workshop-utils/timing.server'
import fsExtra from 'fs-extra'
import { type Params } from 'react-router'

function parseAppNameFromReferer(request: Request) {
	try {
		const url = new URL(request.headers.get('referer') ?? '')
		const appName = url.pathname.split('/').pop()
		return appName ?? null
	} catch {
		return null
	}
}

export async function resolveApps({
	request,
	params,
	timings,
}: {
	request: Request
	params: Params
	timings: Timings
}) {
	const appName = params.appName ?? parseAppNameFromReferer(request)

	invariantResponse(appName, 'appName param required')
	const app = await getAppByName(appName, { request, timings })

	let fileAppName: string | null = app?.name ?? null
	if (isProblemApp(app)) {
		fileAppName = isProblemApp(app) ? app.solutionName : null
	}
	if (isPlaygroundApp(app)) {
		const appBasis = await getAppByName(app.appName)
		fileAppName = isProblemApp(appBasis) ? appBasis.solutionName : null
	}
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

function unique<ItemType>(
	value: ItemType,
	index: number,
	self: Array<ItemType>,
) {
	return self.indexOf(value) === index
}

export async function firstExisting(...files: Array<string>) {
	for (const file of files.filter(unique)) {
		if (await fsExtra.pathExists(file)) {
			return file
		}
	}
	return null
}
