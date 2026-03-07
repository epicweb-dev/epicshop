import { type Route } from './+types/file-preview'
import path from 'node:path'
import { compileMarkdownString } from '@epic-web/workshop-utils/compile-mdx.server'
import { makeTimings, getServerTimeHeader } from '@epic-web/workshop-utils/timing.server'
import fsExtra from 'fs-extra'
import { data } from 'react-router'
import { z } from 'zod'
import { ensureUndeployed } from '#app/utils/misc.tsx'
import { firstExisting, resolveApps } from './__utils.ts'

const QuerySchema = z.object({
	path: z.string().min(1),
	kind: z.enum(['text', 'markdown']).default('text'),
	language: z.string().optional(),
})

function makeFencedCodeBlock(source: string, language?: string) {
	let fence = '```'
	while (source.includes(fence)) {
		fence += '`'
	}
	const info = language?.trim() ? language.trim() : 'text'
	return `${fence}${info}\n${source}\n${fence}`
}

export async function loader({ request, params }: Route.LoaderArgs) {
	ensureUndeployed()
	const timings = makeTimings('app-file-preview')
	const { app, fileApp } = await resolveApps({ request, params, timings })
	if (!app || !fileApp) {
		throw new Response('Apps not found', { status: 404 })
	}

	const query = QuerySchema.safeParse(
		Object.fromEntries(new URL(request.url).searchParams),
	)
	if (!query.success) {
		throw new Response('Invalid preview query parameters', { status: 400 })
	}

	const { path: relativePath, kind, language } = query.data
	const filePath = await firstExisting(
		path.join(app.fullPath, relativePath),
		path.join(fileApp.fullPath, relativePath),
	)
	if (!filePath) {
		throw new Response('File not found', { status: 404 })
	}

	const source = await fsExtra.readFile(filePath, 'utf8')
	const markdown = kind === 'markdown'
		? source
		: makeFencedCodeBlock(source, language)
	const code = await compileMarkdownString(markdown)

	return data(
		{ code },
		{
			headers: { 'Server-Timing': getServerTimeHeader(timings) },
		},
	)
}
