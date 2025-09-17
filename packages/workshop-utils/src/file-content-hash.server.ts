import fs from 'fs'
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