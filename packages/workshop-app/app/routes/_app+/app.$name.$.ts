import path from 'path'
import fsExtra from 'fs-extra'
import mimeTypes from 'mime-types'
import esbuild from 'esbuild'
import type { DataFunctionArgs } from '@remix-run/node'
import { redirect } from 'react-router'
import invariant from 'tiny-invariant'
import { getAppByName } from '~/utils/misc.server'

export async function loader({ params }: DataFunctionArgs) {
	const { name: appName, '*': splat } = params
	invariant(appName, 'App name is required')
	invariant(splat, 'Splat is required')
	const app = await getAppByName(appName)
	if (!app) {
		throw new Response(
			`App with name "${appName}" for resource "${splat}" not found`,
			{ status: 404 },
		)
	}
	if (app.dev.type === 'script') {
		return redirect(app.dev.baseUrl)
	}
	// basically a static file server
	const filePath = path.join(app.fullPath, splat)
	const fileExists = await fsExtra.pathExists(filePath)
	if (!fileExists) {
		throw new Response('File not found', { status: 404 })
	}
	if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) {
		// compile ts/tsx files
		const { outputFiles, errors } = await esbuild.build({
			entryPoints: [filePath],
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
