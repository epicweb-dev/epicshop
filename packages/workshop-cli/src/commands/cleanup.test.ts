import { mkdtemp, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup } from './cleanup.ts'

beforeEach(() => {
	vi.spyOn(console, 'log').mockImplementation(() => {})
	vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
	vi.restoreAllMocks()
})

test('cleanup removes caches and deletes data file when empty', async () => {
	const root = await mkdtemp(path.join(os.tmpdir(), 'epicshop-cleanup-'))
	const cacheDir = path.join(root, 'cache')
	const legacyCacheDir = path.join(root, 'legacy-cache')
	const dataPath = path.join(root, 'data.json')

	try {
		await mkdir(cacheDir, { recursive: true })
		await mkdir(legacyCacheDir, { recursive: true })
		await writeFile(path.join(cacheDir, 'cache.json'), '{}')
		await writeFile(path.join(legacyCacheDir, 'legacy.json'), '{}')
		await writeFile(
			dataPath,
			JSON.stringify(
				{
					preferences: { player: { muted: true } },
					authInfos: { 'www.epicweb.dev': { id: 'user-1' } },
					mutedNotifications: ['notice-1'],
				},
				null,
				2,
			),
		)

		const result = await cleanup({
			silent: true,
			force: true,
			targets: ['caches', 'preferences', 'auth'],
			paths: { cacheDir, legacyCacheDir, dataPaths: [dataPath] },
		})

		expect(result.success).toBe(true)
		await expect(stat(cacheDir)).rejects.toThrow()
		await expect(stat(legacyCacheDir)).rejects.toThrow()
		await expect(stat(dataPath)).rejects.toThrow()
	} finally {
		await rm(root, { recursive: true, force: true })
	}
})

test('cleanup removes workshops but keeps non-workshop entries', async () => {
	const root = await mkdtemp(path.join(os.tmpdir(), 'epicshop-cleanup-'))
	const reposDir = path.join(root, 'repos')
	const workshopDir = path.join(reposDir, 'sample-workshop')
	const keepDir = path.join(reposDir, 'notes')

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

		const result = await cleanup({
			silent: true,
			force: true,
			targets: ['workshops'],
			paths: { reposDir },
		})

		expect(result.success).toBe(true)
		await expect(stat(workshopDir)).rejects.toThrow()

		const remaining = await readdir(reposDir)
		expect(remaining).toContain('notes')
	} finally {
		await rm(root, { recursive: true, force: true })
	}
})
