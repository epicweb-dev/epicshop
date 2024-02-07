import os from 'os'
import path from 'path'
import { remember } from '@epic-web/remember'
import {
	cachifiedTimingReporter,
	type Timings,
} from '@kentcdodds/workshop-utils/timing.server'
import * as C from 'cachified'
import {
	lruCacheAdapter,
	verboseReporter,
	type Cache as CachifiedCache,
	type CacheEntry,
	type LRUishCache,
} from 'cachified'
import fsExtra from 'fs-extra'
import { LRUCache } from 'lru-cache'
import md5 from 'md5-hex'
import {
	type App,
	type ExampleApp,
	type PlaygroundApp,
	type ProblemApp,
	type SolutionApp,
} from './apps.server.ts'

export const solutionAppCache =
	makeSingletonCache<SolutionApp>('SolutionAppCache')
export const problemAppCache = makeSingletonCache<ProblemApp>('ProblemAppCache')
export const exampleAppCache = makeSingletonCache<ExampleApp>('ExampleAppCache')
export const playgroundAppCache =
	makeSingletonCache<PlaygroundApp>('PlaygroundAppCache')
export const appsCache = makeSingletonCache<App>('AppsCache')
export const diffCodeCache = makeSingletonCache<string>('DiffCodeCache')
export const diffFilesCache = makeSingletonCache<string>('DiffFilesCache')
export const compiledMarkdownCache = makeSingletonCache<string>(
	'CompiledMarkdownCache',
)
export const embeddedFilesCache =
	makeSingletonCache<Record<string, string[]>>('EmbeddedFilesCache')
export const presenceCache = makeSingletonCache<
	Array<{
		id: string
		avatarUrl: string
		name: string | null | undefined
	}>
>('PresenceCache')

const cacheDir = path.join(os.homedir(), '.kcdshop', 'cache')

export const fsCache: CachifiedCache = {
	name: 'Filesystem cache',
	async get(key) {
		try {
			const filePath = path.join(cacheDir, md5(key))
			const data = await fsExtra.readJSON(filePath)
			return data
		} catch (error: unknown) {
			if (
				error instanceof Error &&
				'code' in error &&
				error.code === 'ENOENT'
			) {
				return null
			}
			throw error
		}
	},
	async set(key, entry) {
		const filePath = path.join(cacheDir, md5(key))
		await fsExtra.ensureDir(path.dirname(filePath))
		await fsExtra.writeJSON(filePath, entry)
	},
	async delete(key) {
		const filePath = path.join(cacheDir, md5(key))
		await fsExtra.remove(filePath)
	},
}

export async function deleteCache() {
	if (process.env.KCDSHOP_DEPLOYED) return null

	try {
		if (await fsExtra.exists(cacheDir)) {
			await fsExtra.remove(cacheDir)
		}
	} catch (error) {
		console.error(`Error deleting the cache in ${cacheDir}`, error)
	}
}

function makeSingletonCache<CacheEntryType>(name: string) {
	return remember(name, () => {
		const cache = new LRUCache<string, CacheEntry<CacheEntryType>>({
			max: 1000,
		}) as LRUishCache
		cache.name = name
		return lruCacheAdapter(cache)
	})
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
	return C.cachified({
		...options,
		key,
		forceFresh: await shouldForceFresh({
			forceFresh: options.forceFresh,
			request,
			key,
		}),
		reporter: C.mergeReporters(
			cachifiedTimingReporter(timings),
			options.reporter,
			process.env.KCDSHOP_DEBUG_CACHE ? verboseReporter() : undefined,
		),
	})
}

export async function shouldForceFresh({
	forceFresh,
	request,
	key,
}: {
	forceFresh?: boolean | string
	request?: Request
	key?: string
}) {
	if (typeof forceFresh === 'boolean') return forceFresh
	if (typeof forceFresh === 'string' && key) {
		return forceFresh.split(',').includes(key)
	}

	if (!request) return false
	const fresh = new URL(request.url).searchParams.get('fresh')
	if (typeof fresh !== 'string') return false
	if (fresh === '') return true
	if (!key) return false

	return fresh.split(',').includes(key)
}
