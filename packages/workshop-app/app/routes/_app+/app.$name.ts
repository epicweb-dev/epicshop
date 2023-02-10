import fsExtra from 'fs-extra'
import path from 'path'
import type { DataFunctionArgs } from '@remix-run/node'
import { redirect } from '@remix-run/node'
import invariant from 'tiny-invariant'
import { getAppByName } from '~/utils/misc.server'
import { typedBoolean } from '~/utils/misc'

export async function loader({ params }: DataFunctionArgs) {
	const { name: appName } = params
	invariant(appName, 'App name is required')
	const app = await getAppByName(appName)
	if (!app) {
		throw new Response(`App "${appName}" not found`, { status: 404 })
	}
	if (app.hasServer) {
		return redirect(app.baseUrl)
	}
	const htmlFile = path.join(app.fullPath, 'index.html')
	const hasHtml = await fsExtra.pathExists(htmlFile)
	if (hasHtml) {
		const html = await fsExtra.readFile(htmlFile)
		return new Response(html, {
			headers: {
				'Content-Length': Buffer.byteLength(html).toString(),
				'Content-Type': 'text/html',
			},
		})
	}
	const indexFiles = (await fsExtra.readdir(app.fullPath)).filter(
		(file: string) => file.startsWith('index.'),
	)
	const indexCss = indexFiles.find((file: string) => file.endsWith('.css'))
	const indexJs = indexFiles.find((file: string) => file.endsWith('.js'))
	const indexTs = indexFiles.find((file: string) => file.endsWith('.ts'))
	const indexTsx = indexFiles.find((file: string) => file.endsWith('.tsx'))
	const scripts = [indexJs, indexTs, indexTsx].filter(typedBoolean)
	if (scripts.length > 1) {
		throw new Response(
			`Only one index.(js|ts|tsx) file is allowed, found ${scripts.join(', ')}`,
			{ status: 400 },
		)
	}
	const html = /* html */ `
<!DOCTYPE html>
<html>
	<head>
		<base href="${app.baseUrl}" />
		<meta charset="utf-8">
		<meta name="viewport" content="width=device-width, initial-scale=1">
		<title>${app.title}</title>
		${indexCss ? `<link rel="stylesheet" href="${indexCss}">` : ''}
	</head>
	<body>
		${scripts
			.map(script => `<script type="module" src="${script}"></script>`)
			.join('\n')}
		<script type="module" src="kcd_sse.js"></script>
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
