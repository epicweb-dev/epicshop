// eslint-disable-next-line import/order -- this must be first
import { getEnv } from './init-env.js'

import path from 'path'
import * as C from '@epic-web/cachified'
import { type CacheEntry, type CreateReporter } from '@epic-web/cachified'
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
import { resolveCacheDir } from './data-storage.server.js'
import { logger, isLoggingEnabled } from './logger.js'
import { type Notification } from './notifications.server.js'
import { cachifiedTimingReporter, type Timings } from './timing.server.js'
import { checkConnectionCached } from './utils.server.js'

const cacheDir = resolveCacheDir()

// Format cache time helper function (copied from @epic-web/cachified for consistency)
function formatCacheTime(
	metadata: any,
	formatDuration: (ms: number) => string,
): string {
	const ttl = metadata?.ttl
	if (ttl === undefined || ttl === Infinity) return 'forever'
	return formatDuration(ttl)
}

// Default duration formatter (copied from @epic-web/cachified for consistency)
function defaultFormatDuration(ms: number): string {
	if (ms < 1000) return `${Math.round(ms)}ms`
	if (ms < 60000) return `${Math.round(ms / 1000)}s`
	if (ms < 3600000) return `${Math.round(ms / 60000)}m`
	return `${Math.round(ms / 3600000)}h`
}

/**
 * Creates a cachified reporter that integrates with the Epic Workshop logger system.
 * Uses the pattern `epic:cache:{name-of-cache}` for logger namespaces.
 * Only logs when the specific cache namespace is enabled via NODE_DEBUG.
 */
export function epicCacheReporter<Value>({
	formatDuration = defaultFormatDuration,
	performance = globalThis.performance || Date,
}: {
	formatDuration?: (ms: number) => string
	performance?: Pick<typeof Date, 'now'>
} = {}): CreateReporter<Value> {
	return ({ key, fallbackToCache, forceFresh, metadata, cache }) => {
		// Determine cache name for logger namespace
		const cacheName =
			cache.name || cache.toString().replace(/^\[object (.*?)]$/, '$1')

		// Create logger with epic:cache:{name} pattern
		// Extract a reasonable cache name from longer descriptions
		let loggerSuffix = 'unknown'
		if (cacheName.includes('(') && cacheName.includes(')')) {
			// Extract name from "Filesystem cache (CacheName)" format
			const match = cacheName.match(/\(([^)]+)\)/)
			loggerSuffix = (match?.[1] ?? 'unknown').toLowerCase()
		} else if (cacheName === 'LRUCache') {
			// For LRU caches, we can't determine the name from the cache object alone
			loggerSuffix = 'lru'
		} else {
			loggerSuffix = cacheName.toLowerCase()
		}

		const namespace = `epic:cache:${loggerSuffix}`

		// Only create logger if cache logging is enabled for this namespace
		if (!isLoggingEnabled(namespace)) {
			// Return a no-op reporter if logging is not enabled
			return () => {}
		}

		const log = logger(namespace)

		let freshValue: unknown
		let getFreshValueStartTs: number
		let refreshValueStartTS: number

		return (event) => {
			switch (event.name) {
				case 'getCachedValueStart': {
					log(`Starting cache lookup for ${key}`)
					break
				}
				case 'getCachedValueEmpty': {
					log(`Cache miss for ${key}`)
					break
				}
				case 'getCachedValueSuccess': {
					log(`Cache hit for ${key}`)
					break
				}
				case 'done': {
					log(`Cache operation done for ${key}`)
					break
				}
				case 'getCachedValueRead': {
					log(`Read cached value for ${key}`)
					break
				}
				case 'getFreshValueHookPending': {
					log(`Waiting for ongoing fetch for fresh value for ${key}`)
					break
				}
				case 'getCachedValueOutdated': {
					log(`Cached value for ${key} is outdated`)
					break
				}
				case 'checkCachedValueErrorObj': {
					log.warn(
						`check failed for cached value of ${key}\nReason: ${event.reason}.\nDeleting the cache key and trying to get a fresh value.`,
					)
					break
				}
				case 'checkFreshValueErrorObj': {
					log.error(
						`check failed for fresh value of ${key}\nReason: ${event.reason}.`,
						freshValue,
					)
					break
				}
				case 'getFreshValueCacheFallback': {
					log(
						`Falling back to cached value for ${key} due to error getting fresh value.`,
					)
					break
				}
				case 'checkCachedValueError': {
					log.warn(
						`check failed for cached value of ${key}\nReason: ${event.reason}.\nDeleting the cache key and trying to get a fresh value.`,
					)
					break
				}
				case 'getCachedValueError': {
					log.error(
						`error with cache at ${key}. Deleting the cache key and trying to get a fresh value.`,
						event.error,
					)
					break
				}
				case 'getFreshValueError': {
					log.error(
						`getting a fresh value for ${key} failed`,
						{ fallbackToCache, forceFresh },
						event.error,
					)
					break
				}
				case 'getFreshValueStart': {
					getFreshValueStartTs = performance.now()
					break
				}
				case 'writeFreshValueSuccess': {
					const totalTime = performance.now() - getFreshValueStartTs
					if (event.written) {
						log(
							`Updated the cache value for ${key}.`,
							`Getting a fresh value for this took ${formatDuration(
								totalTime,
							)}.`,
							`Caching for ${formatCacheTime(
								metadata,
								formatDuration,
							)} in ${cacheName}.`,
						)
					} else {
						log(
							`Not updating the cache value for ${key}.`,
							`Getting a fresh value for this took ${formatDuration(
								totalTime,
							)}.`,
							`Thereby exceeding caching time of ${formatCacheTime(
								metadata,
								formatDuration,
							)}`,
						)
					}
					break
				}
				case 'writeFreshValueError': {
					log.error(`error setting cache: ${key}`, event.error)
					break
				}
				case 'getFreshValueSuccess': {
					freshValue = event.value
					break
				}
				case 'checkFreshValueError': {
					log.error(
						`check failed for fresh value of ${key}\nReason: ${event.reason}.`,
						freshValue,
					)
					break
				}
				case 'refreshValueStart': {
					refreshValueStartTS = performance.now()
					break
				}
				case 'refreshValueSuccess': {
					log(
						`Background refresh for ${key} successful.`,
						`Getting a fresh value for this took ${formatDuration(
							performance.now() - refreshValueStartTS,
						)}.`,
						`Caching for ${formatCacheTime(
							metadata,
							formatDuration,
						)} in ${cacheName}.`,
					)
					break
				}
				case 'refreshValueError': {
					log.error(`Background refresh for ${key} failed.`, event.error)
					break
				}
				default: {
					// @ts-expect-error Defensive programming: log unknown events for debugging
					log(`Unknown cache event "${event.name}" for key ${key}`)
					break
				}
			}
		}
	}
}

export const solutionAppCache =
	makeSingletonFsCache<SolutionApp>('SolutionAppCache')
export const problemAppCache =
	makeSingletonFsCache<ProblemApp>('ProblemAppCache')
export const exampleAppCache =
	makeSingletonFsCache<ExampleApp>('ExampleAppCache')
export const playgroundAppCache =
	makeSingletonFsCache<PlaygroundApp>('PlaygroundAppCache')
export const appsCache = makeSingletonFsCache<App>('AppsCache')
export const diffCodeCache = makeSingletonFsCache<string>('DiffCodeCache')
export const diffFilesCache = makeSingletonFsCache<string>('DiffFilesCache')
export const copyUnignoredFilesCache = makeSingletonCache<string>(
	'CopyUnignoredFilesCache',
)
export const compiledMarkdownCache = makeSingletonFsCache<string>(
	'CompiledMarkdownCache',
)
export const compiledCodeCache =
	makeSingletonFsCache<string>('CompiledCodeCache')
export const ogCache = makeSingletonCache<string>('OgCache')
export const compiledInstructionMarkdownCache = makeSingletonFsCache<{
	code: string
	title: string | null
	epicVideoEmbeds: Array<string>
}>('CompiledInstructionMarkdownCache')
export const dirModifiedTimeCache = makeSingletonCache<number>(
	'DirModifiedTimeCache',
)
export const connectionCache = makeSingletonCache<boolean>('ConnectionCache')
export const checkForUpdatesCache = makeSingletonCache<{
	updatesAvailable: boolean
	localCommit: string
	remoteCommit: string
	diffLink: string | null
}>('CheckForUpdatesCache')
export const notificationsCache =
	makeSingletonCache<Array<Notification>>('NotificationsCache')
export const directoryEmptyCache = makeSingletonCache<boolean>(
	'DirectoryEmptyCache',
)

export const fsCache = makeSingletonFsCache('FsCache')

async function readJsonFilesInDirectory(
	dir: string,
): Promise<Record<string, any>> {
	const files = await fsExtra.readdir(dir)
	const entries = await Promise.all(
		files.map(async (file) => {
			const filePath = path.join(dir, file)
			const stats = await fsExtra.stat(filePath)
			if (stats.isDirectory()) {
				const subEntries = await readJsonFilesInDirectory(filePath)
				return [file, subEntries]
			} else {
				const maxRetries = 2
				const baseDelay = 25 // shorter delay for directory listing

				for (let attempt = 0; attempt <= maxRetries; attempt++) {
					try {
						const data = await fsExtra.readJSON(filePath)
						return [file, data]
					} catch (error: unknown) {
						// Handle JSON parsing errors (could be race condition or corruption)
						if (
							error instanceof SyntaxError &&
							error.message.includes('JSON')
						) {
							// If this is a retry attempt, it might be a race condition
							if (attempt < maxRetries) {
								const delay = baseDelay * Math.pow(2, attempt)
								console.warn(
									`JSON parsing error on attempt ${attempt + 1}/${maxRetries + 1} for directory listing ${filePath}, retrying in ${delay}ms...`,
								)
								await new Promise((resolve) => setTimeout(resolve, delay))
								continue
							}

							// Final attempt failed, skip the file
							console.warn(
								`Skipping corrupted JSON file in directory listing after ${attempt + 1} attempts: ${filePath}`,
							)
							return [file, null]
						}
						throw error
					}
				}

				// This should never be reached, but just in case
				return [file, null]
			}
		}),
	)
	return Object.fromEntries(entries)
}

export async function getAllFileCacheEntries() {
	return readJsonFilesInDirectory(cacheDir)
}

export async function deleteCacheEntry(entryPath: string) {
	if (getEnv().EPICSHOP_DEPLOYED) return null
	
	try {
		const fullPath = path.join(cacheDir, entryPath)
		if (await fsExtra.exists(fullPath)) {
			await fsExtra.remove(fullPath)
		}
	} catch (error) {
		console.error(`Error deleting cache entry at ${entryPath}`, error)
		throw error
	}
}

export async function updateCacheEntry(entryPath: string, content: any) {
	if (getEnv().EPICSHOP_DEPLOYED) return null
	
	try {
		const fullPath = path.join(cacheDir, entryPath)
		await fsExtra.ensureDir(path.dirname(fullPath))
		await fsExtra.writeJSON(fullPath, content, { spaces: 2 })
	} catch (error) {
		console.error(`Error updating cache entry at ${entryPath}`, error)
		throw error
	}
}

export async function deleteCache() {
	if (getEnv().EPICSHOP_DEPLOYED) return null

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
		const cacheInstanceDir = path.join(
			cacheDir,
			getEnv().EPICSHOP_WORKSHOP_INSTANCE_ID,
			name,
		)

		const fsCache: C.Cache<CacheEntryType> = {
			name: `Filesystem cache (${name})`,
			async get(key) {
				const filePath = path.join(cacheInstanceDir, md5(key))
				const maxRetries = 3
				const baseDelay = 10

				for (let attempt = 0; attempt <= maxRetries; attempt++) {
					try {
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

						// Handle JSON parsing errors (could be race condition or corruption)
						if (
							error instanceof SyntaxError &&
							error.message.includes('JSON')
						) {
							// If this is a retry attempt, it might be a race condition
							if (attempt < maxRetries) {
								const delay = baseDelay * Math.pow(2, attempt) // exponential backoff
								console.warn(
									`JSON parsing error on attempt ${attempt + 1}/${maxRetries + 1} for ${filePath}, retrying in ${delay}ms...`,
								)
								await new Promise((resolve) => setTimeout(resolve, delay))
								continue
							}

							// Final attempt failed, treat as corrupted file
							// Log to Sentry if available
							if (getEnv().SENTRY_DSN && getEnv().EPICSHOP_IS_PUBLISHED) {
								try {
									const Sentry = await import('@sentry/react-router')
									Sentry.captureException(error, {
										tags: {
											error_type: 'corrupted_cache_file',
											cache_name: name,
											cache_key: key,
											retry_attempts: attempt.toString(),
										},
										extra: {
											filePath,
											errorMessage: error.message,
											cacheName: name,
											cacheKey: key,
											retryAttempts: attempt,
										},
									})
								} catch (sentryError) {
									console.error('Failed to log to Sentry:', sentryError)
								}
							}

							// Delete the corrupted file
							try {
								await fsExtra.remove(filePath)
								console.warn(
									`Deleted corrupted cache file after ${attempt + 1} attempts: ${filePath}`,
								)
							} catch (deleteError) {
								console.error(
									`Failed to delete corrupted cache file ${filePath}:`,
									deleteError,
								)
							}

							return null
						}

						// For other errors, don't retry
						throw error
					}
				}

				// This should never be reached, but just in case
				return null
			},
			async set(key, entry) {
				const filePath = path.join(cacheInstanceDir, md5(key))
				const tempPath = `${filePath}.tmp`
				await fsExtra.ensureDir(path.dirname(filePath))
				// Write to temp file first, then atomically move to final location
				// This prevents race conditions where readers see partially written JSON files
				await fsExtra.writeJSON(tempPath, { key, entry })
				await fsExtra.move(tempPath, filePath, { overwrite: true })
			},
			async delete(key) {
				const filePath = path.join(cacheInstanceDir, md5(key))
				await fsExtra.remove(filePath)
			},
		}

		return fsCache
	})
}

/**
 * This wraps @epic-web/cachified to add a few handy features:
 *
 * 1. Automatic timing for timing headers
 * 2. Automatic force refresh based on the request and enhancement of forceFresh
 * to support comma-separated keys to force
 * 3. Offline fallback support. If a fallback is given and we are detected to be
 * offline, then the cached value is used regardless of whether it's expired and
 * if one is not present then the given fallback will be used.
 */
export async function cachified<Value>({
	request,
	timings,
	key,
	timingKey = key.length > 18 ? `${key.slice(0, 7)}...${key.slice(-8)}` : key,
	offlineFallbackValue,
	...options
}: Omit<C.CachifiedOptions<Value>, 'forceFresh'> & {
	request?: Request
	timings?: Timings
	forceFresh?: boolean | string
	timingKey?: string
	offlineFallbackValue?: Value
}): Promise<Value> {
	if (offlineFallbackValue !== undefined) {
		const isOnline = await checkConnectionCached({ request, timings })
		if (!isOnline) {
			const cacheEntry = await options.cache.get(key)
			return cacheEntry?.value ?? offlineFallbackValue
		}
	}
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
			epicCacheReporter(),
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
