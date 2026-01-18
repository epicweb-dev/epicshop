import { mkdtemp, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { uninstall } from './uninstall.ts'

beforeEach(() => {
	vi.spyOn(console, 'log').mockImplementation(() => {})
	vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
	vi.restoreAllMocks()
})

test('uninstall removes workshops and support directories', async () => {
	const root = await mkdtemp(path.join(os.tmpdir(), 'epicshop-uninstall-'))
	const reposDir = path.join(root, 'repos')
	const workshopDir = path.join(reposDir, 'sample-workshop')
	const keepDir = path.join(reposDir, 'notes')
	const primaryDir = path.join(root, 'state')
	const cacheDir = path.join(root, 'cache')
	const legacyDir = path.join(root, 'legacy')
	const fallbackDir = path.join(root, 'tmp')

	try {
		await mkdir(workshopDir, { recursive: true })
		await writeFile(
			path.join(workshopDir, 'package.json'),
			JSON.stringify(
				{
					name: 'sample-workshop',
					epicshop: { title: 'Sample Workshop' },
				},
				null,
				2,
			),
		)
		await mkdir(keepDir, { recursive: true })
		await writeFile(path.join(keepDir, 'notes.txt'), 'keep')
		await mkdir(primaryDir, { recursive: true })
		await writeFile(path.join(primaryDir, 'data.json'), '{}')
		await mkdir(cacheDir, { recursive: true })
		await writeFile(path.join(cacheDir, 'cache.json'), '{}')
		await mkdir(legacyDir, { recursive: true })
		await writeFile(path.join(legacyDir, 'legacy.json'), '{}')
		await mkdir(fallbackDir, { recursive: true })
		await writeFile(path.join(fallbackDir, 'temp.json'), '{}')

		const result = await uninstall({
			silent: true,
			force: true,
			paths: { reposDir, primaryDir, cacheDir, legacyDir, fallbackDir },
		})

		expect(result.success).toBe(true)
		await expect(stat(workshopDir)).rejects.toThrow()
		await expect(stat(primaryDir)).rejects.toThrow()
		await expect(stat(cacheDir)).rejects.toThrow()
		await expect(stat(legacyDir)).rejects.toThrow()
		await expect(stat(fallbackDir)).rejects.toThrow()

		const remaining = await readdir(reposDir)
		expect(remaining).toContain('notes')
	} finally {
		await rm(root, { recursive: true, force: true })
	}
})
