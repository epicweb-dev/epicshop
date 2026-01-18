import '@epic-web/workshop-utils/init-env'

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import chalk from 'chalk'
import { resolveCacheDir } from '@epic-web/workshop-utils/data-storage.server'

export type ClearCacheResult = {
	success: boolean
	message?: string
	error?: Error
	removedPaths?: string[]
	skippedPaths?: string[]
}

type ClearCachePaths = {
	cacheDir: string
	legacyCacheDir: string
}

export type ClearCacheOptions = {
	silent?: boolean
	paths?: Partial<ClearCachePaths>
}

function resolveClearCachePaths(
	paths: Partial<ClearCachePaths> = {},
): ClearCachePaths {
	return {
		cacheDir: paths.cacheDir ?? resolveCacheDir(),
		legacyCacheDir:
			paths.legacyCacheDir ?? path.join(os.homedir(), '.epicshop', 'cache'),
	}
}

async function pathExists(targetPath: string): Promise<boolean> {
	try {
		await fs.access(targetPath)
		return true
	} catch {
		return false
	}
}

/**
 * Clear local epicshop caches.
 */
export async function clearCache({
	silent = false,
	paths,
}: ClearCacheOptions = {}): Promise<ClearCacheResult> {
	const { cacheDir, legacyCacheDir } = resolveClearCachePaths(paths)
	const targets = Array.from(new Set([cacheDir, legacyCacheDir]))
	const removedPaths: string[] = []
	const skippedPaths: string[] = []
	const failures: Array<{ path: string; error: Error }> = []

	if (!silent) {
		console.log(chalk.blue('Clearing epicshop caches...'))
	}

	for (const target of targets) {
		const exists = await pathExists(target)
		if (!exists) {
			skippedPaths.push(target)
			continue
		}
		try {
			await fs.rm(target, { recursive: true, force: true })
			removedPaths.push(target)
		} catch (error) {
			failures.push({
				path: target,
				error: error instanceof Error ? error : new Error(String(error)),
			})
		}
	}

	if (failures.length > 0) {
		const message = `Failed to clear ${failures.length} cache path(s).`
		if (!silent) {
			console.error(chalk.red(message))
			for (const failure of failures) {
				console.error(
					chalk.red(`- ${failure.path}: ${failure.error.message}`),
				)
			}
		}
		return {
			success: false,
			message,
			error: new Error(
				failures.map((failure) => failure.error.message).join('; '),
			),
			removedPaths,
			skippedPaths,
		}
	}

	const message =
		removedPaths.length > 0
			? `Cleared ${removedPaths.length} cache path(s).`
			: 'No cache directories found.'

	if (!silent) {
		const color = removedPaths.length > 0 ? chalk.green : chalk.gray
		console.log(color(message))
	}

	return { success: true, message, removedPaths, skippedPaths }
}
