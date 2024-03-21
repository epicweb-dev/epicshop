import {
	type App,
	getApps,
	getExerciseApp,
	isExampleApp,
	isPlaygroundApp,
} from '@kentcdodds/workshop-utils/apps.server'
import { type Timings } from '@kentcdodds/workshop-utils/timing.server'
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
	const { pathname } = url
	const segments = pathname.split('/').filter(Boolean)
	const appType =
		segments[1] === 'exercise'
			? 'exercise'
			: segments[1] === 'playground'
				? 'playground'
				: segments[1] === 'examples'
					? 'example'
					: null

	const apps = await getApps({ request, timings })
	let app: App | null = null
	if (appType === 'example') {
		const { exampleName } = params
		const exampleApps = apps.filter(isExampleApp)
		app = exampleApps.find(app => app.dirName === exampleName) ?? null
	} else if (appType === 'playground') {
		app = apps.find(isPlaygroundApp) ?? null
	} else {
		app = await getExerciseApp(params, { request, timings })
	}

	const fileAppName = url.searchParams.get('fileAppName')
	const fileApp = fileAppName ? apps.find(app => app.name === fileAppName) : app

	return { app, fileApp }
}
