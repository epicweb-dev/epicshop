import fsExtra from 'fs-extra'
import path from 'path'
import type { DataFunctionArgs } from '@remix-run/node'
import { redirect } from '@remix-run/node'
import invariant from 'tiny-invariant'
import {
	getAppByName,
	getExercise,
	getWorkshopTitle,
	isExerciseStepApp,
	isProblemApp,
	isSolutionApp,
	isPlaygroundApp,
} from '~/utils/apps.server.ts'
import { getServerTimeHeader, makeTimings } from '~/utils/timing.server.ts'

export async function loader({ params, request }: DataFunctionArgs) {
	const timings = makeTimings('app_test_loader')
	const { id: appId, testName } = params
	invariant(appId, 'App id is required')
	invariant(testName, 'Test name is required')
	const app = await getAppByName(appId, { request, timings })
	if (!app) {
		throw new Response(`App "${appId}" not found`, {
			status: 404,
			headers: { 'Server-Timing': getServerTimeHeader(timings) },
		})
	}
	if (app.test.type !== 'browser') {
		return redirect(app.dev.baseUrl, {
			headers: { 'Server-Timing': getServerTimeHeader(timings) },
		})
	}

	const testFile = app.test.testFiles.find(file => file === testName)
	if (!testFile) {
		throw new Response(`Test "${testName}" not found`, {
			status: 404,
			headers: { 'Server-Timing': getServerTimeHeader(timings) },
		})
	}
	if (!/(js|ts|tsx)$/.test(testFile)) {
		// TODO: support other test file types?
		throw new Response(`Test "${testName}" is not a script`, {
			status: 400,
			headers: { 'Server-Timing': getServerTimeHeader(timings) },
		})
	}
	let testFileAppName: string | null = app.name
	if (isProblemApp(app)) {
		testFileAppName = isProblemApp(app) ? app.solutionName : null
	}
	if (isPlaygroundApp(app)) {
		const appBasis = await getAppByName(app.appName)
		testFileAppName = isProblemApp(appBasis) ? appBasis.solutionName : null
	}
	const testFileQueryString = testFileAppName
		? `?fileAppName=${encodeURIComponent(testFileAppName)}`
		: ''
	const testScriptPath = `${app.dev.baseUrl}${testFile}${testFileQueryString}`
	const testScriptSrc = /* javascript */ `
function logStatus(message) {
	if (window.parent !== window) {
		window.parent.postMessage(
			{ type: 'kcdshop:test-status-update', ...message },
			'*',
		)
	} else {
		if (message.status === 'fail') {
			console.error(message)
		} else if (message.status === 'pending') {
			console.info(message)
		} else if (message.status === 'pass') {
			console.log(message)
		}
	}
}
const testFile = ${JSON.stringify(testFile)}
logStatus({status: 'pending', timestamp: Date.now()})
import(${JSON.stringify(testScriptPath)}).then(
	() => {
		logStatus({ status: 'pass', timestamp: Date.now() })
	},
	error => {
		logStatus({
			status: 'fail',
			error:
				typeof error === 'string'
					? error
					: typeof error === 'object' && error && 'message' in error
					? error.message
					: 'unknown error',
			timestamp: Date.now(),
		})
		throw error
	},
)
`

	const testScriptTag = `<script type="module">${testScriptSrc}</script>`

	const htmlFile = path.join(app.fullPath, 'index.html')
	const hasHtml = await fsExtra.pathExists(htmlFile)
	if (hasHtml) {
		const html = await fsExtra.readFile(htmlFile)
		const testableHtml = html
			.toString()
			.replace(`</body>`, `${testScriptTag}</body>`)
		return new Response(testableHtml, {
			headers: {
				'Content-Length': Buffer.byteLength(testableHtml).toString(),
				'Content-Type': 'text/html',
				'Server-Timing': getServerTimeHeader(timings),
			},
		})
	}

	const indexFiles = (await fsExtra.readdir(app.fullPath)).filter(
		(file: string) => file.startsWith('index.'),
	)
	const indexCss = indexFiles.find((file: string) => file.endsWith('index.css'))

	const appTitle = app?.title ?? 'N/A'
	const workshopTitle = await getWorkshopTitle()
	const title = (
		isExerciseStepApp(app)
			? [
					isProblemApp(app) ? '🧪💪' : isSolutionApp(app) ? '🧪🏁' : null,
					`${app.stepNumber.toString().padStart(2, '0')}. ${app.title}`,
					`${app.exerciseNumber.toString().padStart(2, '0')}. ${
						(await getExercise(app.exerciseNumber, { request, timings }))
							?.title ?? 'Unknown'
					}`,
					workshopTitle,
			  ]
			: ['🧪', appTitle]
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
		${testScriptTag}
		<script type="module" src="kcd_ws.js${testFileQueryString}"></script>
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
