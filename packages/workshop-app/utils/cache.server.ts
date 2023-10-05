import * as C from 'cachified'
import {
	lruCacheAdapter,
	verboseReporter,
	type CacheEntry,
	type LRUishCache,
} from 'cachified'
import { LRUCache } from 'lru-cache'
import  {
	type App,
	type ExampleApp,
	type PlaygroundApp,
	type ProblemApp,
	type SolutionApp,
} from './apps.server.ts'
import { singleton } from './singleton.server.ts'
import { time, type Timings } from './timing.server.ts'

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

function makeSingletonCache<CacheEntryType>(name: string) {
	return singleton(name, () => {
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
