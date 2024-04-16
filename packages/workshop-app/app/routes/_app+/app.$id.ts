import path from 'path'
import { invariantResponse } from '@epic-web/invariant'
import {
	getAppByName,
	isExerciseStepApp,
	isSolutionApp,
	isProblemApp,
	getExercise,
	getWorkshopTitle,
	isPlaygroundApp,
} from '@epic-web/workshop-utils/apps.server'
import {
	getServerTimeHeader,
	makeTimings,
} from '@epic-web/workshop-utils/timing.server'
import { type LoaderFunctionArgs, redirect } from '@remix-run/node'
import fsExtra from 'fs-extra'
import { getBaseUrl } from '#app/utils/misc.tsx'

export async function loader({ request, params }: LoaderFunctionArgs) {
	const timings = makeTimings('app')
	const { id: appId } = params
	invariantResponse(appId, 'App id is required')
	const app = await getAppByName(appId, { request, timings })
	const baseApp = isPlaygroundApp(app) ? await getAppByName(app.appName) : app
	if (!app) {
		throw new Response(`App "${appId}" not found`, {
			status: 404,
			headers: { 'Server-Timing': getServerTimeHeader(timings) },
		})
	}
	if (app.dev.type === 'script') {
		return redirect(getBaseUrl({ request, port: app.dev.portNumber }), {
			headers: { 'Server-Timing': getServerTimeHeader(timings) },
		})
	}
	if (app.dev.type !== 'browser') {
		throw new Response(
			`App "${appId}" is not a browser app, its dev type is: "${app.dev.type}"`,
			{ status: 400 },
		)
	}
	const htmlFile = path.join(app.fullPath, 'index.html')
	const hasHtml = await fsExtra.pathExists(htmlFile)
	if (hasHtml) {
		const html = await fsExtra.readFile(htmlFile)
		return new Response(html, {
			headers: {
				'Content-Length': Buffer.byteLength(html).toString(),
				'Content-Type': 'text/html',
				'Server-Timing': getServerTimeHeader(timings),
			},
		})
	}
	const indexFiles = (await fsExtra.readdir(app.fullPath)).filter(
		(file: string) => file.startsWith('index.'),
	)
	const indexCss = indexFiles.find((file: string) => file.endsWith('index.css'))
	const indexJs = indexFiles.find((file: string) => file.endsWith('index.js'))
	const indexTs = indexFiles.find((file: string) => file.endsWith('index.ts'))
	const indexTsx = indexFiles.find((file: string) => file.endsWith('index.tsx'))
	const scripts = [indexJs, indexTs, indexTsx].filter(Boolean)
	if (scripts.length > 1) {
		throw new Response(
			`Only one index.(js|ts|tsx) file is allowed, found ${scripts.join(', ')}`,
			{ status: 400 },
		)
	}
	const appTitle = app.title
	const workshopTitle = await getWorkshopTitle()
	const baseAppTitle = isExerciseStepApp(baseApp)
		? [
				`${baseApp.stepNumber.toString().padStart(2, '0')}. ${baseApp.title}`,
				`${baseApp.exerciseNumber.toString().padStart(2, '0')}. ${
					(await getExercise(baseApp.exerciseNumber, { request, timings }))
						?.title ?? 'Unknown'
				}`,
				workshopTitle,
			]
		: [baseApp?.title ?? 'N/A']
	const title = (
		isExerciseStepApp(app)
			? [
					isProblemApp(app) ? '💪' : isSolutionApp(app) ? '🏁' : null,
					...baseAppTitle,
				]
			: isPlaygroundApp(app)
				? ['🛝', ...baseAppTitle]
				: [appTitle]
	)
		.filter(Boolean)
		.join(' | ')
	const html = /* html */ `
<!DOCTYPE html>
<html>
	<head>
		<base href="${app.dev.pathname}" />
		<meta charset="utf-8">
		<meta name="viewport" content="width=device-width, initial-scale=1">
		<title>${title}</title>
		<link rel="stylesheet" href="/app-default.css">
		${indexCss ? `<link rel="stylesheet" href="${indexCss}">` : ''}
	</head>
	<body>
		${scripts
			.map(script => `<script type="module" src="${script}"></script>`)
			.join('\n')}
		<script type="module" src="epic_ws.js"></script>
	</body>
</html>
`
	return new Response(html, {
		headers: {
			'Content-Length': Buffer.byteLength(html).toString(),
			'Content-Type': 'text/html',
			'Server-Timing': getServerTimeHeader(timings),
		},
	})
}
