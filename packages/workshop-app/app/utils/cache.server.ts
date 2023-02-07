import LRU from 'lru-cache'
import type { CacheEntry } from 'cachified'
import { lruCacheAdapter } from 'cachified'
import type { App, ExampleApp, ProblemApp, SolutionApp } from './misc.server'

declare global {
	var __solution_app_cache__: ReturnType<typeof getSolutionAppCache>
	var __problem_app_cache__: ReturnType<typeof getProblemAppCache>
	var __example_app_cache__: ReturnType<typeof getExampleAppCache>
	var __get_apps_cache__: ReturnType<typeof getGetAppsCache>
	var __diff_code_cache__: ReturnType<typeof getDiffCodeCache>
	var __compiled_markdown_cache__: ReturnType<typeof getCompiledMarkdownCache>
}

export const solutionAppCache = (global.__solution_app_cache__ =
	global.__solution_app_cache__ ?? getSolutionAppCache())

export const problemAppCache = (global.__problem_app_cache__ =
	global.__problem_app_cache__ ?? getProblemAppCache())

export const exampleAppCache = (global.__example_app_cache__ =
	global.__example_app_cache__ ?? getExampleAppCache())

export const getAppCache = (global.__get_apps_cache__ =
	global.__get_apps_cache__ ?? getGetAppsCache())

export const diffCodeCache = (global.__diff_code_cache__ =
	global.__diff_code_cache__ ?? getDiffCodeCache())

export const compiledMarkdownCache = (global.__compiled_markdown_cache__ =
	global.__compiled_markdown_cache__ ?? getCompiledMarkdownCache())

function getSolutionAppCache() {
	return lruCacheAdapter(
		new LRU<string, CacheEntry<SolutionApp>>({ max: 1000 }),
	)
}

function getProblemAppCache() {
	return lruCacheAdapter(new LRU<string, CacheEntry<ProblemApp>>({ max: 1000 }))
}

function getExampleAppCache() {
	return lruCacheAdapter(new LRU<string, CacheEntry<ExampleApp>>({ max: 1000 }))
}

function getGetAppsCache() {
	return lruCacheAdapter(new LRU<string, CacheEntry<App>>({ max: 1000 }))
}

function getDiffCodeCache() {
	return lruCacheAdapter(new LRU<string, CacheEntry<string>>({ max: 1000 }))
}

function getCompiledMarkdownCache() {
	return lruCacheAdapter(new LRU<string, CacheEntry<string>>({ max: 1000 }))
}
