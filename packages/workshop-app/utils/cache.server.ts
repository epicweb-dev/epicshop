import * as C from 'cachified'
import {
	lruCacheAdapter,
	verboseReporter,
	type CacheEntry,
	type LRUishCache,
} from 'cachified'
import { LRUCache } from 'lru-cache'
import type {
	App,
	ExampleApp,
	PlaygroundApp,
	ProblemApp,
	SolutionApp,
} from './apps.server.ts'
import { time, type Timings } from './timing.server.ts'

declare global {
	var __solution_app_cache__: ReturnType<typeof getSolutionAppCache>
	var __problem_app_cache__: ReturnType<typeof getProblemAppCache>
	var __example_app_cache__: ReturnType<typeof getExampleAppCache>
	var __playground_app_cache__: ReturnType<typeof getPlaygroundAppCache>
	var __get_apps_cache__: ReturnType<typeof getAppsCache>
	var __diff_code_cache__: ReturnType<typeof getDiffCodeCache>
	var __diff_files_cache__: ReturnType<typeof getDiffFilesCache>
	var __compiled_markdown_cache__: ReturnType<typeof getCompiledMarkdownCache>
}

export const solutionAppCache = (global.__solution_app_cache__ =
	global.__solution_app_cache__ ?? getSolutionAppCache())

export const problemAppCache = (global.__problem_app_cache__ =
	global.__problem_app_cache__ ?? getProblemAppCache())

export const exampleAppCache = (global.__example_app_cache__ =
	global.__example_app_cache__ ?? getExampleAppCache())

export const playgroundAppCache = (global.__playground_app_cache__ =
	global.__playground_app_cache__ ?? getPlaygroundAppCache())

export const appsCache = (global.__get_apps_cache__ =
	global.__get_apps_cache__ ?? getAppsCache())

export const diffCodeCache = (global.__diff_code_cache__ =
	global.__diff_code_cache__ ?? getDiffCodeCache())

export const diffFilesCache = (global.__diff_files_cache__ =
	global.__diff_files_cache__ ?? getDiffFilesCache())

export const compiledMarkdownCache = (global.__compiled_markdown_cache__ =
	global.__compiled_markdown_cache__ ?? getCompiledMarkdownCache())

function getSolutionAppCache() {
	const cache = new LRUCache<string, CacheEntry<SolutionApp>>({
		max: 1000,
	}) as LRUishCache
	cache.name = 'SolutionAppCache'
	return lruCacheAdapter(cache)
}

function getProblemAppCache() {
	const cache = new LRUCache<string, CacheEntry<ProblemApp>>({
		max: 1000,
	}) as LRUishCache
	cache.name = 'ProblemAppCache'
	return lruCacheAdapter(cache)
}

function getExampleAppCache() {
	const cache = new LRUCache<string, CacheEntry<ExampleApp>>({
		max: 1000,
	}) as LRUishCache
	cache.name = 'ExampleAppCache'
	return lruCacheAdapter(cache)
}

function getPlaygroundAppCache() {
	const cache = new LRUCache<string, CacheEntry<PlaygroundApp>>({
		max: 1000,
	}) as LRUishCache
	cache.name = 'PlaygroundAppCache'
	return lruCacheAdapter(cache)
}

function getAppsCache() {
	const cache = new LRUCache<string, CacheEntry<App>>({
		max: 1000,
	}) as LRUishCache
	cache.name = 'AppsCache'
	return lruCacheAdapter(cache)
}

function getDiffCodeCache() {
	const cache = new LRUCache<string, CacheEntry<string>>({
		max: 1000,
	}) as LRUishCache
	cache.name = 'DiffCodeCache'
	return lruCacheAdapter(cache)
}

function getDiffFilesCache() {
	const cache = new LRUCache<string, CacheEntry<string>>({
		max: 1000,
	}) as LRUishCache
	cache.name = 'DiffFilesCache'
	return lruCacheAdapter(cache)
}

function getCompiledMarkdownCache() {
	const cache = new LRUCache<string, CacheEntry<string>>({
		max: 1000,
	}) as LRUishCache
	cache.name = 'CompiledMarkdownCache'
	return lruCacheAdapter(cache)
}

export async function cachified<Value>({
	request,
	timings,
	key,
	timingKey = key.length > 18 ? key.slice(0, 7) + '...' + key.slice(-8) : key,
	...options
}: Omit<C.CachifiedOptions<Value>, 'forceFresh'> & {
	request?: Request
	timings?: Timings
	forceFresh?: boolean | string
	timingKey?: string
}): Promise<Value> {
	let cachifiedResolved = false
	const forceFresh = await shouldForceFresh({
		forceFresh: options.forceFresh,
		request,
		key,
	})
	const cachifiedPromise = C.cachified({
		...options,
		reporter: process.env.KCDSHOP_DEBUG_CACHE ? verboseReporter() : undefined,
		key,
		forceFresh,
		getFreshValue: async context => {
			// if we've already retrieved the cached value, then this may be called
			// after the response has already been sent so there's no point in timing
			// how long this is going to take
			if (!cachifiedResolved && timings) {
				return time(() => options.getFreshValue(context), {
					timings,
					type: `getFreshValue:${timingKey}`,
					desc: `FRESH ${timingKey}`,
				})
			}
			return options.getFreshValue(context)
		},
	})
	const result = await time(cachifiedPromise, {
		timings,
		type: `cache:${timingKey}`,
		desc: `CACHE ${timingKey}`,
	})
	cachifiedResolved = true
	return result
}

export async function shouldForceFresh({
	forceFresh,
	request,
	key,
}: {
	forceFresh?: boolean | string
	request?: Request
	key: string
}) {
	if (typeof forceFresh === 'boolean') return forceFresh
	if (typeof forceFresh === 'string') return forceFresh.split(',').includes(key)

	if (!request) return false
	const fresh = new URL(request.url).searchParams.get('fresh')
	if (typeof fresh !== 'string') return false
	if (fresh === '') return true

	return fresh.split(',').includes(key)
}
