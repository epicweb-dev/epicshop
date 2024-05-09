import path from 'path'
import { invariantResponse } from '@epic-web/invariant'
import { getAppByName } from '@epic-web/workshop-utils/apps.server'
import { makeTimings } from '@epic-web/workshop-utils/timing.server'
import { redirect, type LoaderFunctionArgs } from '@remix-run/node'
import etag from 'etag'
import fsExtra from 'fs-extra'
import mimeTypes from 'mime-types'
import { compileTs } from '#app/utils/compile-app.server.ts'
import { combineHeaders, getBaseUrl } from '#app/utils/misc.tsx'

export async function loader({ request, params }: LoaderFunctionArgs) {
	const timings = makeTimings('app-file')
	const { id: appId, '*': splat } = params
	const url = new URL(request.url)
	const fileAppName = url.searchParams.get('fileAppName')
	invariantResponse(appId, 'App id is required')
	invariantResponse(splat, 'Splat is required')
	const app = await getAppByName(appId)
	const fileApp = fileAppName ? await getAppByName(fileAppName) : app
	if (!fileApp || !app) {
		throw new Response(
			`Apps with ids "${fileAppName}" (resolveDir) and "${appId}" (app) for resource "${splat}" not found`,
			{ status: 404 },
		)
	}
	if (app.dev.type === 'script') {
		return redirect(getBaseUrl({ request, port: app.dev.portNumber }))
	}

	const filePath = path.join(fileApp.fullPath, splat)
	const fileExists = await fsExtra.pathExists(filePath)
	if (!fileExists) {
		throw new Response('File not found', { status: 404 })
	}
	if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) {
		// compile ts/tsx files
		const { outputFiles, errors } = await compileTs(filePath, app.fullPath, {
			request,
			timings,
		})
		if (errors.length) {
			console.error(`Failed to compile file "${filePath}"`)
			console.error(errors)
			throw new Response(errors.join('\n'), { status: 500 })
		}
		if (!outputFiles?.[0]) {
			throw new Response('Failed to compile file', { status: 500 })
		}
		const file = outputFiles[0].text
		return getFileResponse(file, { 'Content-Type': 'text/javascript' })
	} else {
		const file = await fsExtra.readFile(filePath)
		const mimeType = mimeTypes.lookup(filePath) || 'text/plain'
		return getFileResponse(file, { 'Content-Type': mimeType })
	}

	function getFileResponse(file: Buffer | string, headers: HeadersInit = {}) {
		const etagValue = etag(file)
		const ifNoneMatch = request.headers.get('if-none-match')
		if (ifNoneMatch === etagValue) {
			return new Response(null, { status: 304 })
		}
		return new Response(file, {
			headers: combineHeaders(
				{
					'Content-Length': Buffer.byteLength(file).toString(),
					'Server-Timing': timings.toString(),
					ETag: etagValue,
				},
				headers,
			),
		})
	}
}
