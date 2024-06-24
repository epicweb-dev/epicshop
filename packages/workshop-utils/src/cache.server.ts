import os from 'os'
import path from 'path'
import * as C from '@epic-web/cachified'
import {
	verboseReporter,
	type CacheEntry,
	type Cache as CachifiedCache,
} from '@epic-web/cachified'
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
export type CachedEmbeddedFilesList = Record<string, string[]>
export const embeddedFilesCache = makeSingletonCache<
	CachedEmbeddedFilesList | undefined
>('EmbeddedFilesCache')
export const compiledCodeCache = makeSingletonCache<string>('CompiledCodeCache')

const cacheDir = path.join(os.homedir(), '.epicshop', 'cache')

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

export async function cachified<Value>({
	request,
	timings,
	key,
	// TODO: figure out what this was for before...
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	timingKey = key.length > 18 ? `${key.slice(0, 7)}...${key.slice(-8)}` : key,
	...options
}: Omit<C.CachifiedOptions<Value>, 'forceFresh'> & {
	request?: Request
	timings?: Timings
	forceFresh?: boolean | string
	timingKey?: string
}): Promise<Value> {
	return C.cachified(
		{
			...options,
			key,
			forceFresh: await shouldForceFresh({
				forceFresh: options.forceFresh,
				request,
				key,
			}),
		},
		C.mergeReporters(
			cachifiedTimingReporter(timings),
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
