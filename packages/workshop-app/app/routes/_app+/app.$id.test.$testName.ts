import fsExtra from 'fs-extra'
import path from 'path'
import type { DataFunctionArgs } from '@remix-run/node'
import { redirect } from '@remix-run/node'
import invariant from 'tiny-invariant'
import { getAppById, isProblemApp } from '~/utils/apps.server'

export async function loader({ params, request }: DataFunctionArgs) {
	const { id: appId, testName } = params
	invariant(appId, 'App id is required')
	invariant(testName, 'Test name is required')
	const app = await getAppById(appId)
	if (!app) {
		throw new Response(`App "${appId}" not found`, { status: 404 })
	}
	if (app.test.type !== 'browser') {
		return redirect(app.dev.baseUrl)
	}

	const testFile = app.test.testFiles.find(file => file === testName)
	if (!testFile) {
		throw new Response(`Test "${testName}" not found`, { status: 404 })
	}
	if (!/(js|ts|tsx)$/.test(testFile)) {
		// TODO: support other test file types?
		throw new Response(`Test "${testName}" is not a script`, { status: 400 })
	}
	const testFileAppId = isProblemApp(app) ? app.solutionId : null
	const testFileQueryString = testFileAppId
		? `?fileAppId=${encodeURIComponent(testFileAppId)}`
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
import(${JSON.stringify(testScriptPath)}).then(() => {
	logStatus({status: 'pass', timestamp: Date.now()})
}, (error) => {
	logStatus({status: 'fail', error, timestamp: Date.now()})
	throw error
})
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
			},
		})
	}

	const indexFiles = (await fsExtra.readdir(app.fullPath)).filter(
		(file: string) => file.startsWith('index.'),
	)
	const indexCss = indexFiles.find((file: string) => file.endsWith('index.css'))
	const html = /* html */ `
<!DOCTYPE html>
<html>
	<head>
		<base href="${app.dev.baseUrl}" />
		<meta charset="utf-8">
		<meta name="viewport" content="width=device-width, initial-scale=1">
		<title>${app.title}</title>
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
		},
	})
}
