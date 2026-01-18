import { mkdtemp, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { expect, test } from 'vitest'
import { consoleError } from '../../../../tests/vitest-setup.ts'
import { cleanup } from './cleanup.ts'

test('removes cache directories and deletes data file when all fields cleaned', async () => {
	consoleError.mockImplementation(() => {})

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

		await expect(
			cleanup({
				silent: true,
				force: true,
				targets: ['caches', 'preferences', 'auth'],
				paths: { cacheDir, legacyCacheDir, dataPaths: [dataPath] },
			}),
		).resolves.toEqual(
			expect.objectContaining({
				success: true,
				removedPaths: expect.arrayContaining([cacheDir, legacyCacheDir, dataPath]),
			}),
		)

		await expect(stat(cacheDir)).rejects.toThrow()
		await expect(stat(legacyCacheDir)).rejects.toThrow()
		await expect(stat(dataPath)).rejects.toThrow()
	} finally {
		await rm(root, { recursive: true, force: true })
	}
})

test('deletes workshops but preserves non-workshop directories', async () => {
	consoleError.mockImplementation(() => {})

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

		await expect(
			cleanup({
				silent: true,
				force: true,
				targets: ['workshops'],
				paths: { reposDir },
			}),
		).resolves.toEqual(
			expect.objectContaining({
				success: true,
				removedPaths: expect.arrayContaining([workshopDir]),
			}),
		)

		await expect(stat(workshopDir)).rejects.toThrow()

		const remaining = await readdir(reposDir)
		expect(remaining).toContain('notes')
	} finally {
		await rm(root, { recursive: true, force: true })
	}
})

test('accepts offline-videos as a cleanup target', async () => {
	consoleError.mockImplementation(() => {})

	const root = await mkdtemp(path.join(os.tmpdir(), 'epicshop-cleanup-'))
	const cacheDir = path.join(root, 'cache')
	const legacyCacheDir = path.join(root, 'legacy-cache')

	try {
		await mkdir(cacheDir, { recursive: true })
		await mkdir(legacyCacheDir, { recursive: true })

		await expect(
			cleanup({
				silent: true,
				force: true,
				targets: ['offline-videos'],
				paths: { cacheDir, legacyCacheDir, dataPaths: [] },
			}),
		).resolves.toEqual(
			expect.objectContaining({
				success: true,
				selectedTargets: expect.arrayContaining(['offline-videos']),
			}),
		)

		// Verify cache dirs were not deleted when only offline-videos selected
		await expect(stat(cacheDir)).resolves.toBeDefined()
		await expect(stat(legacyCacheDir)).resolves.toBeDefined()
	} finally {
		await rm(root, { recursive: true, force: true })
	}
})
