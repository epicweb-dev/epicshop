import path from 'node:path'
import { invariantResponse } from '@epic-web/invariant'
import { makeTimings } from '@epic-web/workshop-utils/timing.server'
import fsExtra from 'fs-extra'
import {
	redirect,
	type ActionFunctionArgs,
	type LoaderFunctionArgs,
} from 'react-router'
import { z } from 'zod'
import { compileTs } from '#app/utils/compile-app.server.ts'
import { ensureUndeployed, getBaseUrl } from '#app/utils/misc.tsx'
import { resolveApps } from './__utils'

export async function loader(args: LoaderFunctionArgs) {
	ensureUndeployed()
	const api = await getApiModule(args)
	const loaderFn = api.mod.loader as
		| ((loaderArgs: LoaderFunctionArgs) => unknown)
		| undefined
	invariantResponse(
		loaderFn,
		'Attempted to make a GET request to the api endpoint but the api module does not export a loader function',
		{ status: 405 },
	)
	try {
		const result = await loaderFn(args)
		return result
	} catch (error) {
		api.cleanupError(error)
	}
}

export async function action(args: ActionFunctionArgs) {
	ensureUndeployed()
	const api = await getApiModule(args)
	const actionFn = api.mod.action as
		| ((actionArgs: ActionFunctionArgs) => unknown)
		| undefined
	invariantResponse(
		actionFn,
		'Attempted to make a non-GET request to the api endpoint but the api module does not export an action function',
		{ status: 405 },
	)
	try {
		const result = await actionFn(args)
		return result
	} catch (error) {
		api.cleanupError(error)
	}
}

const ApiModuleSchema = z.object({
	loader: z.function().optional(),
	action: z.function().optional(),
})

async function getApiModule({ request, params }: LoaderFunctionArgs) {
	const timings = makeTimings('app-api')
	const { fileApp, app } = await resolveApps({ request, params, timings })
	if (!fileApp || !app) {
		throw new Response(`Apps not found`, { status: 404 })
	}
	if (app.dev.type === 'script') {
		throw redirect(getBaseUrl({ request, port: app.dev.portNumber }))
	}

	const apiFiles = (await fsExtra.readdir(app.fullPath))
		.filter((file: string) => /^api\.server\.(ts|tsx|js|jsx)$/.test(file))
		.map((f) => path.join(app.fullPath, f))
	const apiFile = apiFiles[0]
	if (!apiFile) {
		throw new Response(
			`No api.server.(ts|tsx|js|jsx) file found in "${app.fullPath}"`,
			{ status: 404 },
		)
	}
	if (apiFiles.length > 1) {
		throw new Response(
			`Only one api.server.(ts|tsx|js|jsx) file is allowed, found ${apiFiles.join(', ')}`,
			{ status: 400 },
		)
	}

	const { outputFiles, errors } = await compileTs(apiFile, app.fullPath, {
		esbuildOptions: {
			platform: 'node',
			// packages external causes issues in Node 20 because Node tries to resolve the package.json from the data URL 🤷‍♂️
			// packages: 'external', // figure out how to turn this on in the future...
			// just adds noise to errors and doesn't appear to help with debugging
			sourcemap: false,
			// remove the process.env define
			define: {},
		},
		request,
		timings,
	})
	if (errors.length) {
		console.error(`Failed to compile file "${apiFile}"`)
		console.error(errors)
		throw new Response(errors.join('\n'), { status: 500 })
	}
	if (!outputFiles?.[0]) {
		throw new Response(`Failed to compile file "${apiFile}"`, { status: 500 })
	}
	const apiCode = outputFiles[0].text
	const dataUrl = `data:text/javascript;base64,${Buffer.from(apiCode).toString('base64')}`
	const mod = await import(/* @vite-ignore */ dataUrl).catch(cleanupError)
	const apiModule = ApiModuleSchema.safeParse(mod)
	if (!apiModule.success) {
		throw new Response(
			`Invalid api module. It should export a loader and/or action: ${apiModule.error.message}`,
			{ status: 500 },
		)
	}
	return {
		mod: apiModule.data,
		cleanupError,
	}

	function cleanupError(error: unknown) {
		if (apiFile && error instanceof Error && error.stack) {
			error.stack = error.stack.replace(dataUrl, apiFile)
		}
		throw error
	}
}
