import fs from 'node:fs/promises'
import path from 'node:path'

export type DirectorySizeResult = {
	bytes: number
	files: number
	directories: number
}

/**
 * Calculate the total size of a directory recursively.
 */
export async function getDirectorySize(
	targetPath: string,
): Promise<DirectorySizeResult> {
	const result: DirectorySizeResult = {
		bytes: 0,
		files: 0,
		directories: 0,
	}

	try {
		const stat = await fs.stat(targetPath)

		if (stat.isFile()) {
			result.bytes = stat.size
			result.files = 1
			return result
		}

		if (!stat.isDirectory()) {
			return result
		}

		result.directories = 1
		const entries = await fs.readdir(targetPath, { withFileTypes: true })

		for (const entry of entries) {
			const entryPath = path.join(targetPath, entry.name)

			if (entry.isFile()) {
				try {
					const fileStat = await fs.stat(entryPath)
					result.bytes += fileStat.size
					result.files += 1
				} catch {
					// Skip files we can't access
				}
			} else if (entry.isDirectory()) {
				try {
					const subResult = await getDirectorySize(entryPath)
					result.bytes += subResult.bytes
					result.files += subResult.files
					result.directories += subResult.directories
				} catch {
					// Skip directories we can't access
				}
			}
		}

		return result
	} catch {
		return result
	}
}

/**
 * Format bytes into a human-readable string.
 */
export function formatBytes(bytes: number): string {
	if (bytes === 0) return '0 B'

	const k = 1024
	const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
	const i = Math.floor(Math.log(bytes) / Math.log(k))

	return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`
}

/**
 * Check if a path exists.
 */
export async function pathExists(targetPath: string): Promise<boolean> {
	try {
		await fs.access(targetPath)
		return true
	} catch {
		return false
	}
}
