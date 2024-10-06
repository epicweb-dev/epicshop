import os from 'os'
import path from 'path'
import * as C from '@epic-web/cachified'
import { verboseReporter, type CacheEntry } from '@epic-web/cachified'
import { remember } from '@epic-web/remember'
import fsExtra from 'fs-extra'
import { LRUCache } from 'lru-cache'
import md5 from 'md5-hex'
import {
	type App,
	type ExampleApp,
	type PlaygroundApp,
	type ProblemApp,
	type SolutionApp,
} from './apps.server.js'
import { cachifiedTimingReporter, type Timings } from './timing.server.js'

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
export const compiledCodeCache = makeSingletonCache<string>('CompiledCodeCache')
export const ogCache = makeSingletonCache<string>('OgCache')
export const compiledInstructionMarkdownCache = makeSingletonFsCache<{
	code: string
	title: string | null
	epicVideoEmbeds: Array<string>
}>('CompiledInstructionMarkdownCache')
export const dirModifiedTimeCache = makeSingletonCache<number>(
	'DirModifiedTimeCache',
)

const cacheDir = path.join(os.homedir(), '.epicshop', 'cache')

export const fsCache = makeSingletonFsCache('FsCache')

export async function getAllFileCacheEntries() {
	const files = await fsExtra.readdir(cacheDir)
	const entries = await Promise.all(
		files
			.map(async (file) => {
				const filePath = path.join(cacheDir, file)
				const data = await fsExtra.readJSON(filePath)
				return data
			})
			.filter(Boolean),
	)
	return entries
}

export async function deleteCache() {
	if (process.env.EPICSHOP_DEPLOYED) return null

	try {
		if (await fsExtra.exists(cacheDir)) {
			await fsExtra.remove(cacheDir)
		}
	} catch (error) {
		console.error(`Error deleting the cache in ${cacheDir}`, error)
	}
}

export function makeSingletonCache<CacheEntryType>(name: string) {
	return remember(name, () => {
		const lruInstance = new LRUCache<string, CacheEntry<CacheEntryType>>({
			max: 1000,
		})

		const lru = {
			name,
			set: (key, value) => {
				const ttl = C.totalTtl(value.metadata)
				lruInstance.set(key, value, {
					ttl: ttl === Infinity ? undefined : ttl,
					start: value.metadata.createdTime,
				})
				return value
			},
			get: (key) => lruInstance.get(key),
			delete: (key) => lruInstance.delete(key),
		} satisfies C.Cache<CacheEntryType>

		return lru
	})
}

export function makeSingletonFsCache<CacheEntryType>(name: string) {
	return remember(name, () => {
		const cacheDir = path.join(os.homedir(), '.epicshop', 'cache', name)

		const fsCache: C.Cache<CacheEntryType> = {
			name: `Filesystem cache (${name})`,
			async get(key) {
				try {
					const filePath = path.join(cacheDir, md5(key))
					const data = await fsExtra.readJSON(filePath)
					if (data.entry) return data.entry
					return null
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
				await fsExtra.writeJSON(filePath, { key, entry })
			},
			async delete(key) {
				const filePath = path.join(cacheDir, md5(key))
				await fsExtra.remove(filePath)
			},
		}

		return fsCache
	})
}

export async function cachified<Value>({
	request,
	timings,
	key,
	timingKey = key.length > 18 ? `${key.slice(0, 7)}...${key.slice(-8)}` : key,
	...options
}: Omit<C.CachifiedOptions<Value>, 'forceFresh'> & {
	request?: Request
	timings?: Timings
	forceFresh?: boolean | string
	timingKey?: string
}): Promise<Value> {
	const forceFresh = await shouldForceFresh({
		forceFresh: options.forceFresh,
		request,
		key,
	})
	return C.cachified(
		{
			...options,
			key,
			forceFresh,
		},
		C.mergeReporters(
			cachifiedTimingReporter(timings, timingKey),
			process.env.EPICSHOP_DEBUG_CACHE ? verboseReporter() : undefined,
		),
	)
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
