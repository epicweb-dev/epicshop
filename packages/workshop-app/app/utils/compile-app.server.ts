import fs from 'fs'
import path from 'path'
import { type CacheEntry } from '@epic-web/cachified'
import { getAppFromFile } from '@epic-web/workshop-utils/apps.server'
import {
	cachified,
	compiledCodeCache,
} from '@epic-web/workshop-utils/cache.server'
import { getDirModifiedTime } from '@epic-web/workshop-utils/modified-time.server'
import { type Timings } from '@epic-web/workshop-utils/timing.server'
import * as esbuild from 'esbuild'
import { z } from 'zod'

const CompileResultSchema = z
	.object({
		outputFiles: z.array(z.any()),
		errors: z.array(z.any()),
		warnings: z.array(z.any()),
	})
	.passthrough()

async function getForceFresh(
	filePath: string,
	cacheEntry:
		| CacheEntry
		| null
		| undefined
		| Promise<CacheEntry | null | undefined>,
) {
	cacheEntry = await cacheEntry
	if (!cacheEntry) return true
	const app = await getAppFromFile(filePath)
	if (!app) return true
	const appModified = await getDirModifiedTime(app.fullPath)
	const cacheModified = cacheEntry.metadata.createdTime
	return !cacheModified || appModified > cacheModified || undefined
}

export async function compileTs(
	filePath: string,
	fullPath: string,
	{
		esbuildOptions,
		forceFresh,
		request,
		timings,
	}: {
		forceFresh?: boolean
		request?: Request
		timings?: Timings
		esbuildOptions?: esbuild.BuildOptions
	} = {},
) {
	const key = `${filePath}::${fullPath}`
	return cachified({
		key,
		request,
		timings,
		forceFresh:
			forceFresh ||
			(await getForceFresh(filePath, compiledCodeCache.get(key))) ||
			(await getForceFresh(fullPath, compiledCodeCache.get(key))),
		cache: compiledCodeCache,
		checkValue: CompileResultSchema,
		getFreshValue: async () => {
			try {
				const result = await esbuild.build({
					stdin: {
						contents: await fs.promises.readFile(filePath, 'utf-8'),
						// NOTE: if the fileAppName is specified, then we're resolving to a different
						// app than the one we're serving the file from. We do this so the tests
						// can live in the solution directory, but be run against the problem
						resolveDir: fullPath,
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
					jsx: 'automatic',
					minify: false,
					sourcemap: 'inline',
					...esbuildOptions,
				})
				return {
					outputFiles: result.outputFiles ?? [],
					errors: result.errors,
					warnings: result.warnings,
				}
			} catch (error) {
				// esbuild throws errors when build fails, but the error object contains
				// the errors array. We need to catch it and return it in a consistent format
				// so it doesn't fall back to cached values.
				if (
					error &&
					typeof error === 'object' &&
					'errors' in error &&
					Array.isArray((error as { errors: unknown[] }).errors)
				) {
					// Return the error in the same format as esbuild.build result
					return {
						outputFiles: [],
						errors: (error as { errors: unknown[] }).errors,
						warnings: [],
					}
				}
				// If it's not an esbuild error, wrap it
				return {
					outputFiles: [],
					errors: [error],
					warnings: [],
				}
			}
		},
	})
}
