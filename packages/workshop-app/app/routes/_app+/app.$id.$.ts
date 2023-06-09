import path from 'path'
import fsExtra from 'fs-extra'
import mimeTypes from 'mime-types'
import { redirect, type DataFunctionArgs } from '@remix-run/node'
import invariant from 'tiny-invariant'
import { getAppByName } from '~/utils/apps.server.ts'
import { compileTs } from '~/utils/compile-app.server.ts'

export async function loader({ params, request }: DataFunctionArgs) {
	const { id: appId, '*': splat } = params
	const url = new URL(request.url)
	const fileAppName = url.searchParams.get('fileAppName')
	invariant(appId, 'App id is required')
	invariant(splat, 'Splat is required')
	const app = await getAppByName(appId)
	const fileApp = fileAppName ? await getAppByName(fileAppName) : app
	if (!fileApp || !app) {
		throw new Response(
			`Apps with ids "${fileAppName}" (resolveDir) and "${appId}" (app) for resource "${splat}" not found`,
			{ status: 404 },
		)
	}
	if (app.dev.type === 'script') {
		return redirect(app.dev.baseUrl)
	}

	const filePath = path.join(fileApp.fullPath, splat)
	const fileExists = await fsExtra.pathExists(filePath)
	if (!fileExists) {
		throw new Response('File not found', { status: 404 })
	}
	if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) {
		// compile ts/tsx files
		const { outputFiles, errors } = await compileTs(filePath, app.fullPath)
		if (errors.length) {
			console.error(`Failed to compile file "${filePath}"`)
			console.error(errors)
			throw new Response(errors.join('\n'), { status: 500 })
		}
		if (!outputFiles || !outputFiles[0]) {
			throw new Response('Failed to compile file', { status: 500 })
		}
		const file = outputFiles[0].text
		return new Response(file, {
			headers: {
				'Content-Length': Buffer.byteLength(file).toString(),
				'Content-Type': 'text/javascript',
			},
		})
	} else {
		const file = await fsExtra.readFile(filePath)
		const mimeType = mimeTypes.lookup(filePath) || 'text/plain'
		return new Response(file, {
			headers: {
				'Content-Length': Buffer.byteLength(file).toString(),
				'Content-Type': mimeType,
			},
		})
	}
}
