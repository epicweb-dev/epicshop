import fs from 'node:fs/promises'
import path from 'node:path'
import { epicApiCache } from '@epic-web/workshop-utils/cache.server'
import { getWorkshopConfig } from '@epic-web/workshop-utils/config.server'
import { getEnv } from '@epic-web/workshop-utils/init-env'
import { getErrorMessage } from '@epic-web/workshop-utils/utils'

export type MigrateResult = {
	success: boolean
	message?: string
	error?: Error
}

export async function migrate(): Promise<MigrateResult | null> {
	try {
		const results = await Promise.all([
			deleteFsCache(),
			deleteUnexpiringWorkshopDataCache(),
		])
		// If all results are null, nothing to migrate
		if (results.every((r) => r === null)) {
			return null
		}
		const migrateResults = results.filter((r): r is MigrateResult => r !== null)
		const allSuccessful = migrateResults.every((r) => r.success)
		const resultMessages = results.map((r, i) => {
			if (r === null) return `✅ Nothing to migrate for step ${i + 1}`
			return `${r.success ? '✅' : '❌'} ${r.message || 'No message'}`
		})
		return {
			success: allSuccessful,
			message: `Migration results:\n${resultMessages.join('\n')}`,
			error: allSuccessful
				? undefined
				: new Error(
						'Some migration steps failed: ' +
							migrateResults
								.filter((r) => !r.success)
								.map((r) => r.error?.message || 'Unknown error')
								.join('; '),
					),
		}
	} catch (error) {
		return {
			success: false,
			message: 'Migration failed',
			error:
				error instanceof Error
					? error
					: new Error(getErrorMessage(error, 'Unknown error during migration')),
		}
	}
}

/**
 * This used to be the general file system cache before we moved each cache to
 * it's own instance of a file system cache, so we'll delete the old one.
 */
async function deleteFsCache(): Promise<MigrateResult | null> {
	const { resolveCacheDir } =
		await import('@epic-web/workshop-utils/data-storage.server')
	const cacheDir = resolveCacheDir()
	const fsCacheDir = path.join(
		cacheDir,
		getEnv().EPICSHOP_WORKSHOP_INSTANCE_ID,
		'FsCache',
	)
	// Check if the directory exists before attempting to delete
	const dirExists = await fs
		.access(fsCacheDir)
		.then(() => true)
		.catch(() => false)

	if (!dirExists) return null

	try {
		await fs.rm(fsCacheDir, { recursive: true, force: true })
		const message = `Deleted filesystem cache directory: ${fsCacheDir}`
		return { success: true, message }
	} catch (error) {
		return {
			success: false,
			message: 'Failed to delete filesystem cache',
			error:
				error instanceof Error
					? error
					: new Error(
							getErrorMessage(error, 'Unknown error during FsCache deletion'),
						),
		}
	}
}

/**
 * Turns out workshop data can actually change and making it unexpiring was a bad idea.
 */
async function deleteUnexpiringWorkshopDataCache(): Promise<MigrateResult | null> {
	const {
		product: { host, slug },
	} = getWorkshopConfig()
	if (!host || !slug) return null

	const cacheKey = `epic-workshop-data:${host}:${slug}`
	const cacheEntry = await epicApiCache.get(cacheKey)
	if (!cacheEntry) return null
	// If it has a TTL and it's not infinity, it's not unexpiring, so nothing to do
	if (cacheEntry.metadata.ttl && cacheEntry.metadata.ttl !== Infinity) {
		await epicApiCache.set(cacheKey, {
			...cacheEntry,
			metadata: { ...cacheEntry.metadata, ttl: undefined },
		})
		return null
	}

	await epicApiCache.delete(cacheKey)
	const message = `Deleted unexpiring workshop data cache entry: ${cacheKey}`

	return { success: true, message }
}
