// eslint-disable-next-line import/order -- this must be first
import { getEnv } from './init-env.ts'

import path from 'path'
import * as C from '@epic-web/cachified'
import { type CacheEntry, type CreateReporter } from '@epic-web/cachified'
import { remember } from '@epic-web/remember'
import fsExtra from 'fs-extra'
import { LRUCache } from 'lru-cache'
import md5 from 'md5-hex'
import z from 'zod'
import {
	type ExtraApp,
	type PlaygroundApp,
	type ProblemApp,
	type SolutionApp,
} from './apps.server.ts'
import { resolveCacheDir } from './data-storage.server.ts'
import { logger } from './logger.ts'
import { type Notification } from './notifications.server.ts'
import { cachifiedTimingReporter, type Timings } from './timing.server.ts'
import { checkConnection } from './utils.server.ts'

const MAX_CACHE_FILE_SIZE = 3 * 1024 * 1024 // 3MB in bytes
const cacheDir = resolveCacheDir()
const log = logger('epic:cache')
type DiffStatus = 'renamed' | 'modified' | 'deleted' | 'added' | 'unknown'
type DiffFile = { status: DiffStatus; path: string; line: number }
type CompiledCodeResult = {
	outputFiles?: Array<unknown>
	errors: Array<unknown>
	warnings: Array<unknown>
}
type OgCacheValue = string | Uint8Array

// Throttle repeated Sentry reports for corrupted cache files to reduce noise
const corruptedReportThrottle = remember(
	'epic:cache:corruption-throttle',
	() => new LRUCache<string, number>({ max: 2000, ttl: 60_000 }),
)

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

		const cacheLog = log.logger(loggerSuffix)

		let freshValue: unknown
		let getFreshValueStartTs: number
		let refreshValueStartTS: number

		return (event) => {
			switch (event.name) {
				case 'getCachedValueStart': {
					cacheLog(`Starting cache lookup for ${key}`)
					break
				}
				case 'getCachedValueEmpty': {
					cacheLog(`Cache miss for ${key}`)
					break
				}
				case 'getCachedValueSuccess': {
					cacheLog(`Cache hit for ${key}`)
					break
				}
				case 'done': {
					cacheLog(`Cache operation done for ${key}`)
					break
				}
				case 'getCachedValueRead': {
					cacheLog(`Read cached value for ${key}`)
					break
				}
				case 'getFreshValueHookPending': {
					cacheLog(`Waiting for ongoing fetch for fresh value for ${key}`)
					break
				}
				case 'getCachedValueOutdated': {
					cacheLog(`Cached value for ${key} is outdated`)
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
					cacheLog(
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
						cacheLog(
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
						cacheLog(
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
					cacheLog(
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
					cacheLog(`Unknown cache event "${event.name}" for key ${key}`)
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
export const extraAppCache = makeSingletonFsCache<ExtraApp>('ExtraAppCache')
export const playgroundAppCache =
	makeSingletonFsCache<PlaygroundApp>('PlaygroundAppCache')
export const diffCodeCache = makeSingletonFsCache<string>('DiffCodeCache')
export const diffFilesCache =
	makeSingletonFsCache<Array<DiffFile>>('DiffFilesCache')
export const copyUnignoredFilesCache = makeSingletonCache<boolean>(
	'CopyUnignoredFilesCache',
)
export const compiledMarkdownCache = makeSingletonFsCache<string>(
	'CompiledMarkdownCache',
)
export const compiledCodeCache =
	makeSingletonCache<CompiledCodeResult>('CompiledCodeCache')
export const ogCache = makeSingletonCache<OgCacheValue>('OgCache')
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
	repoUpdatesAvailable: boolean
	dependenciesNeedInstall: boolean
	updateNotificationId: string | null
	commitsAhead: number | null
	commitsBehind: number | null
	localCommit: string | null
	remoteCommit: string | null
	diffLink: string | null
	message: string | null
}>('CheckForUpdatesCache')
export const notificationsCache =
	makeSingletonCache<Array<Notification>>('NotificationsCache')
export const directoryEmptyCache = makeSingletonCache<boolean>(
	'DirectoryEmptyCache',
)

export const discordCache = makeSingletonFsCache('DiscordCache')
export const epicApiCache = makeSingletonFsCache('EpicApiCache')

export function makeGlobalFsCache<CacheEntryType>(name: string) {
	return remember(`global-${name}`, () => {
		const cacheInstanceDir = path.join(cacheDir, 'global', name)

		const fsCache: C.Cache<CacheEntryType> = {
			name: `Filesystem cache (global-${name})`,
			async get(key) {
				const filePath = path.join(cacheInstanceDir, md5(key))

				try {
					const stats = await fsExtra.stat(filePath)
					if (stats.size > MAX_CACHE_FILE_SIZE) {
						const sizeInMB = (stats.size / (1024 * 1024)).toFixed(2)
						log.warn(
							`Skipping large cache file ${filePath} (${sizeInMB}MB > 3MB limit). ` +
								`Consider clearing "${name}" cache for key: ${key}`,
						)
						return null
					}
				} catch (error: unknown) {
					if (
						error instanceof Error &&
						'code' in error &&
						error.code === 'ENOENT'
					) {
						return null
					}
				}

				const data = await readJSONWithRetries(filePath)
				if (data?.entry) return data.entry
				return null
			},
			async set(key, entry) {
				const filePath = path.join(cacheInstanceDir, md5(key))
				const tempPath = `${filePath}.tmp`
				await fsExtra.ensureDir(path.dirname(filePath))
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

export const githubCache = makeGlobalFsCache('GitHubCache')

async function readJsonFilesInDirectory(
	dir: string,
): Promise<Record<string, any>> {
	const files = await fsExtra.readdir(dir)
	const entries = await Promise.all(
		files
			.filter((file) => {
				// Filter out system files that should not be parsed as JSON
				const lowercaseFile = file.toLowerCase()
				return (
					!lowercaseFile.startsWith('.ds_store') &&
					!lowercaseFile.startsWith('.') &&
					!lowercaseFile.includes('thumbs.db')
				)
			})
			.map(async (file) => {
				const filePath = path.join(dir, file)
				const stats = await fsExtra.stat(filePath)
				if (stats.isDirectory()) {
					const subEntries = await readJsonFilesInDirectory(filePath)
					return [file, subEntries]
				} else {
					// Check file size before attempting to read JSON
					if (stats.size > MAX_CACHE_FILE_SIZE) {
						const sizeInMB = (stats.size / (1024 * 1024)).toFixed(2)
						log.warn(
							`Skipping large cache file ${filePath} (${sizeInMB}MB > 3MB limit). ` +
								`Consider clearing cache or excluding this file type from the admin interface.`,
						)
						return [
							file,
							{
								error: `File too large (${sizeInMB}MB > 3MB limit)`,
								size: stats.size,
								skipped: true,
							},
						]
					}

					const data = await readJSONWithRetries(filePath)
					if (data) {
						return [file, { ...data, size: stats.size, filepath: filePath }]
					}

					return [file, null]
				}
			}),
	)
	return Object.fromEntries(entries)
}

// Helper to read JSON with a couple retries; deletes corrupted files and warns
async function readJSONWithRetries(filePath: string): Promise<any | null> {
	const maxRetries = 3
	const baseDelay = 10
	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		try {
			return await fsExtra.readJSON(filePath)
		} catch (error: unknown) {
			if (
				error instanceof Error &&
				'code' in error &&
				(error as NodeJS.ErrnoException).code === 'ENOENT'
			) {
				return null
			}

			const isJsonParseError =
				error instanceof SyntaxError ||
				(error instanceof Error && error.message.includes('JSON'))

			if (isJsonParseError) {
				if (attempt < maxRetries) {
					const delay = baseDelay * Math.pow(2, attempt)
					console.warn(
						`JSON parsing error on attempt ${attempt + 1}/${maxRetries + 1} for ${filePath}, retrying in ${delay}ms...`,
					)
					await new Promise((r) => setTimeout(r, delay))
					continue
				}

				// Final attempt failed: optionally report and delete file
				if (getEnv().SENTRY_DSN && getEnv().EPICSHOP_IS_PUBLISHED) {
					const throttleKey = `readJSON:${md5(filePath)}`
					if (!corruptedReportThrottle.has(throttleKey)) {
						corruptedReportThrottle.set(throttleKey, Date.now())
						try {
							const Sentry = await import('@sentry/react-router')
							Sentry.withScope((scope) => {
								scope.setLevel('warning')
								scope.setTag('error_type', 'corrupted_cache_file')
								scope.setExtra('filePath', filePath)
								scope.setExtra('errorMessage', (error as Error).message)
								scope.setExtra('retryAttempts', attempt)
								Sentry.captureException(error)
							})
						} catch (sentryError) {
							console.error('Failed to log to Sentry:', sentryError)
						}
					}
				}

				// Always delete corrupted files so subsequent reads can refetch
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

			// Other errors: do not retry
			throw error
		}
	}

	return null
}

const CacheEntrySchema = z.object({
	key: z.string(),
	entry: z.object({
		value: z.unknown(),
		metadata: z.object({
			createdTime: z.number(),
			// Stored JSON may serialize Infinity as null; allow number | null | undefined
			ttl: z.number().nullable().optional(),
			// Some entries may omit swr; allow optional
			swr: z.number().optional(),
		}),
	}),
	size: z.number().optional(), // File size in bytes
	filepath: z.string().optional(), // Full filesystem path to the cache file
})

// Schema for files that were skipped due to size limits
const SkippedFileSchema = z.object({
	error: z.string(),
	size: z.number(),
	skipped: z.literal(true),
})

// Combined schema that can handle both cache entries and skipped files
const CacheFileSchema = z.union([CacheEntrySchema, SkippedFileSchema])

type CacheEntryType = z.infer<typeof CacheEntrySchema>
type CacheFileType = z.infer<typeof CacheFileSchema>
type SkippedFileType = z.infer<typeof SkippedFileSchema>

const isSkippedFile = (value: CacheFileType): value is SkippedFileType => {
	return (
		typeof value === 'object' &&
		value !== null &&
		'skipped' in value &&
		(value as { skipped?: unknown }).skipped === true
	)
}

export const WorkshopCacheSchema = z
	.record(
		z.string(),
		z.record(z.string(), z.record(z.string(), CacheFileSchema)),
	)
	.transform((workshopCaches) => {
		type CacheEntryWithFilename = CacheEntryType & { filename: string }
		type SkippedFileWithFilename = {
			filename: string
			error: string
			size: number
			skipped: true
		}
		type Cache = {
			name: string
			entries: Array<CacheEntryWithFilename>
			skippedFiles?: Array<SkippedFileWithFilename>
		}

		const cachesArray: Array<{
			workshopId: string
			caches: Array<Cache>
		}> = []

		for (const [workshopId, caches] of Object.entries(workshopCaches)) {
			const cachesInDir: Array<Cache> = []
			for (const [cacheName, entriesObj] of Object.entries(caches)) {
				const entries: Array<CacheEntryWithFilename> = []
				const skippedFiles: Array<SkippedFileWithFilename> = []

				for (const [key, value] of Object.entries(entriesObj)) {
					if (isSkippedFile(value)) {
						// This is a skipped file
						skippedFiles.push({
							filename: key,
							error: value.error,
							size: value.size,
							skipped: true,
						})
					} else {
						// This is a regular cache entry
						entries.push({ ...(value as CacheEntryType), filename: key })
					}
				}

				const cache: Cache = { name: cacheName, entries }
				if (skippedFiles.length > 0) {
					cache.skippedFiles = skippedFiles
				}
				cachesInDir.push(cache)
			}
			cachesArray.push({ workshopId, caches: cachesInDir })
		}

		return cachesArray
	})

export async function getAllWorkshopCaches() {
	const files = await readJsonFilesInDirectory(cacheDir)
	// Exclude the global directory from workshop caches
	const { global, ...workshopCaches } = files
	const parseResult = WorkshopCacheSchema.safeParse(workshopCaches)
	if (!parseResult.success) {
		log.error('Failed to parse workshop caches:', parseResult.error)
		return []
	}
	return parseResult.data
}

export async function globalCacheDirectoryExists(): Promise<boolean> {
	const globalCacheDir = path.join(cacheDir, 'global')
	return await fsExtra.exists(globalCacheDir)
}

export async function getGlobalCaches() {
	const globalCacheDir = path.join(cacheDir, 'global')
	if (!(await fsExtra.exists(globalCacheDir))) {
		return []
	}

	const files = await readJsonFilesInDirectory(globalCacheDir)
	const parseResult = WorkshopCacheSchema.safeParse({ global: files })
	if (!parseResult.success) {
		log.error('Failed to parse global caches:', parseResult.error)
		return []
	}
	return parseResult.data.map((workshopCache) => ({
		...workshopCache,
		workshopId: 'global',
	}))
}

export async function getWorkshopFileCaches() {
	const workshopCacheDir = path.join(
		cacheDir,
		getEnv().EPICSHOP_WORKSHOP_INSTANCE_ID,
	)
	const caches = readJsonFilesInDirectory(workshopCacheDir)
	return caches
}

export async function readEntryByPath(cacheFilePath: string) {
	const filePath = path.join(cacheDir, cacheFilePath)
	const data = await readJSONWithRetries(filePath)
	return data?.entry ?? null
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

export async function deleteCacheEntry(cacheFilePath: string) {
	if (getEnv().EPICSHOP_DEPLOYED) return null

	try {
		const filePath = path.join(cacheDir, cacheFilePath)
		await fsExtra.remove(filePath)
	} catch (error) {
		console.error(`Error deleting cache entry ${cacheFilePath}:`, error)
	}
}

export async function deleteWorkshopCache(
	workshopId: string,
	cacheName?: string,
) {
	if (getEnv().EPICSHOP_DEPLOYED) return null

	try {
		if (cacheName) {
			// Delete specific cache within workshop
			const cachePath = path.join(cacheDir, workshopId, cacheName)
			if (await fsExtra.exists(cachePath)) {
				await fsExtra.remove(cachePath)
			}
		} else {
			// Delete entire workshop cache directory
			const workshopCachePath = path.join(cacheDir, workshopId)
			if (await fsExtra.exists(workshopCachePath)) {
				await fsExtra.remove(workshopCachePath)
			}
		}
	} catch (error) {
		console.error(
			`Error deleting workshop cache ${workshopId}/${cacheName || 'all'}:`,
			error,
		)
	}
}

export async function updateCacheEntry(cacheFilePath: string, newEntry: any) {
	if (getEnv().EPICSHOP_DEPLOYED) return null

	try {
		const filePath = path.join(cacheDir, cacheFilePath)
		const existingData = await readJSONWithRetries(filePath)
		if (!existingData) {
			throw new Error(`Cache file does not exist: ${cacheFilePath}`)
		}

		const updatedData = {
			...existingData,
			entry: {
				...existingData.entry,
				value: newEntry,
				metadata: {
					...existingData.entry.metadata,
					createdTime: Date.now(), // Update timestamp
				},
			},
		}
		await fsExtra.writeJSON(filePath, updatedData)
		return updatedData.entry
	} catch (error) {
		console.error(`Error updating cache entry ${cacheFilePath}:`, error)
		throw error
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

				// Check file size before attempting to read
				try {
					const stats = await fsExtra.stat(filePath)
					if (stats.size > MAX_CACHE_FILE_SIZE) {
						const sizeInMB = (stats.size / (1024 * 1024)).toFixed(2)
						log.warn(
							`Skipping large cache file ${filePath} (${sizeInMB}MB > 3MB limit). ` +
								`Consider clearing "${name}" cache for key: ${key}`,
						)
						return null
					}
				} catch (error: unknown) {
					if (
						error instanceof Error &&
						'code' in error &&
						error.code === 'ENOENT'
					) {
						return null
					}
					// For other stat errors, continue with the read attempt
				}

				// Use the shared helper which retries and deletes corrupted files
				const data = await readJSONWithRetries(filePath)
				if (data?.entry) return data.entry
				return null

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
		const isOnline = await checkConnection({ request, timings })
		if (!isOnline) {
			log.warn(
				`Offline: using cached value for ${key} or offline fallback if no cache is present`,
			)
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
