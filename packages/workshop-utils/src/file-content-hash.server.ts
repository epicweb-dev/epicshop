import fs from 'fs'
import path from 'path'
import md5 from 'md5-hex'

/**
 * Calculates a hash of the file contents for cache invalidation.
 * This is more reliable than modification times since it detects actual content changes.
 */
export async function getFileContentHash(filePath: string): Promise<string | null> {
	try {
		const content = await fs.promises.readFile(filePath, 'utf8')
		return md5(content)
	} catch {
		// File doesn't exist or can't be read
		return null
	}
}

/**
 * Creates a cache key that includes the file content hash.
 * This ensures cache invalidation when file contents change.
 */
export async function createContentBasedCacheKey(
	filePath: string,
	baseKey?: string,
): Promise<string> {
	const contentHash = await getFileContentHash(filePath)
	const key = baseKey ?? `file:${filePath}`
	return contentHash ? `${key}:${contentHash}` : key
}

/**
 * Gets content hashes for all MDX files in the given directories.
 * This is used to detect if any MDX dependencies have changed for app caches.
 */
export async function getMdxContentHashes(dirs: Array<string>): Promise<Record<string, string | null>> {
	const hashes: Record<string, string | null> = {}
	
	for (const dir of dirs) {
		if (!dir) continue
		
		// Check for README.mdx
		const readmePath = path.join(dir, 'README.mdx')
		hashes[readmePath] = await getFileContentHash(readmePath)
		
		// Check for FINISHED.mdx (mainly for exercise directories)
		const finishedPath = path.join(dir, 'FINISHED.mdx')
		hashes[finishedPath] = await getFileContentHash(finishedPath)
	}
	
	return hashes
}

/**
 * Checks if any MDX files have changed content since the cache entry was created.
 * Returns true if any content has changed, false if all content is the same, undefined if no baseline.
 */
export async function haveMdxFilesChanged(
	dirs: Array<string>,
	cacheKey: string,
	mdxHashStore: Map<string, Record<string, string | null>>,
): Promise<boolean | undefined> {
	const currentHashes = await getMdxContentHashes(dirs)
	const previousHashes = mdxHashStore.get(cacheKey)
	
	if (!previousHashes) {
		// No previous hashes to compare against
		return undefined
	}
	
	// Check if any hash has changed
	for (const [filePath, currentHash] of Object.entries(currentHashes)) {
		const previousHash = previousHashes[filePath]
		if (currentHash !== previousHash) {
			return true
		}
	}
	
	return false
}