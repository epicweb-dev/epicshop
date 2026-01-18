import { mkdtemp, mkdir, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { clearCache } from './clear-cache.ts'

beforeEach(() => {
	vi.spyOn(console, 'log').mockImplementation(() => {})
	vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
	vi.restoreAllMocks()
})

test('clearCache removes cache directories when present', async () => {
	const root = await mkdtemp(path.join(os.tmpdir(), 'epicshop-clear-cache-'))
	const cacheDir = path.join(root, 'cache')
	const legacyCacheDir = path.join(root, 'legacy-cache')

	try {
		await mkdir(cacheDir, { recursive: true })
		await mkdir(legacyCacheDir, { recursive: true })
		await writeFile(path.join(cacheDir, 'cache.json'), '{}')
		await writeFile(path.join(legacyCacheDir, 'legacy.json'), '{}')

		const result = await clearCache({
			silent: true,
			paths: { cacheDir, legacyCacheDir },
		})

		expect(result.success).toBe(true)
		await expect(stat(cacheDir)).rejects.toThrow()
		await expect(stat(legacyCacheDir)).rejects.toThrow()
	} finally {
		await rm(root, { recursive: true, force: true })
	}
})

test('clearCache succeeds when directories are missing', async () => {
	const root = await mkdtemp(path.join(os.tmpdir(), 'epicshop-clear-cache-'))
	const cacheDir = path.join(root, 'cache-missing')
	const legacyCacheDir = path.join(root, 'legacy-missing')

	try {
		const result = await clearCache({
			silent: true,
			paths: { cacheDir, legacyCacheDir },
		})

		expect(result.success).toBe(true)
		expect(result.removedPaths).toEqual([])
	} finally {
		await rm(root, { recursive: true, force: true })
	}
})
