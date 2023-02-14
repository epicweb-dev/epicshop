import path from 'path'
import fs from 'fs'
import fsExtra from 'fs-extra'
import mimeTypes from 'mime-types'
import esbuild from 'esbuild'
import type { DataFunctionArgs } from '@remix-run/node'
import { redirect } from 'react-router'
import invariant from 'tiny-invariant'
import { getAppById } from '~/utils/misc.server'

export async function loader({ params, request }: DataFunctionArgs) {
	const { id: appId, '*': splat } = params
	const url = new URL(request.url)
	const fileAppId = url.searchParams.get('fileAppId')
	invariant(appId, 'App id is required')
	invariant(splat, 'Splat is required')
	const app = await getAppById(appId)
	const fileApp = fileAppId ? await getAppById(fileAppId) : app
	if (!fileApp || !app) {
		throw new Response(
			`Apps with ids "${fileAppId}" (resolveDir) and "${appId}" (app) for resource "${splat}" not found`,
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
		const { outputFiles, errors } = await esbuild.build({
			stdin: {
				contents: await fs.promises.readFile(filePath, 'utf-8'),

				// NOTE: if the fileAppId is specified, then we're resolving to a different
				// app than the one we're serving the file from. We do this so the tests
				// can live in the solution directory, but be run against the problem
				resolveDir: app.fullPath,
				sourcefile: path.basename(filePath),
				loader: 'tsx',
			},
			define: {
				'process.env': JSON.stringify({ NODE_ENV: 'development' }),
			},
			bundle: true,
			write: false,
			format: 'esm',
			platform: 'browser',
			minify: false,
			sourcemap: 'inline',
		})
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
