import fsExtra from 'fs-extra'
import path from 'path'
import type { DataFunctionArgs } from '@remix-run/node'
import { redirect } from '@remix-run/node'
import invariant from 'tiny-invariant'
import {
	getAppByName,
	isExerciseStepApp,
	isSolutionApp,
	isProblemApp,
	getExercise,
	getWorkshopTitle,
} from '~/utils/apps.server.ts'
import { getServerTimeHeader, makeTimings } from '~/utils/timing.server.ts'

export async function loader({ request, params }: DataFunctionArgs) {
	const timings = makeTimings('app')
	const { id: appId } = params
	invariant(appId, 'App id is required')
	const app = await getAppByName(appId, { request, timings })
	if (!app) {
		throw new Response(`App "${appId}" not found`, {
			status: 404,
			headers: { 'Server-Timing': getServerTimeHeader(timings) },
		})
	}
	if (app.dev.type === 'script') {
		return redirect(app.dev.baseUrl, {
			headers: { 'Server-Timing': getServerTimeHeader(timings) },
		})
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
	const appTitle = app?.title ?? 'N/A'
	const workshopTitle = await getWorkshopTitle()
	const title = (
		isExerciseStepApp(app)
			? [
					isProblemApp(app) ? '🏃💪' : isSolutionApp(app) ? '🏃🏁' : null,
					`${app.stepNumber.toString().padStart(2, '0')}. ${app.title}`,
					`${app.exerciseNumber.toString().padStart(2, '0')}. ${
						(await getExercise(app.exerciseNumber, { request, timings }))
							?.title ?? 'Unknown'
					}`,
					workshopTitle,
			  ]
			: ['🏃', appTitle]
	)
		.filter(Boolean)
		.join(' | ')
	const html = /* html */ `
<!DOCTYPE html>
<html>
	<head>
		<base href="${app.dev.baseUrl}" />
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
		<script type="module" src="kcd_ws.js"></script>
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
