import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { expect, test } from 'vitest'
import { cleanup } from './cleanup.ts'

test('cleanup removes caches and deletes data file when empty', async () => {
	const root = await mkdtemp(path.join(os.tmpdir(), 'epicshop-cleanup-'))
	const cacheDir = path.join(root, 'cache')
	const legacyCacheDir = path.join(root, 'legacy-cache')
	const dataPath = path.join(root, 'data.json')
	const reposDir = path.join(root, 'repos')

	try {
		await mkdir(reposDir, { recursive: true })
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
			paths: {
				cacheDir,
				legacyCacheDir,
				dataPaths: [dataPath],
				reposDir,
			},
		})

		expect(result.success).toBe(true)
		await expect(stat(cacheDir)).rejects.toThrow()
		await expect(stat(legacyCacheDir)).rejects.toThrow()
		await expect(stat(dataPath)).rejects.toThrow()
	} finally {
		await rm(root, { recursive: true, force: true })
	}
})

test('cleanup removes CLI config file', async () => {
	const root = await mkdtemp(path.join(os.tmpdir(), 'epicshop-cleanup-'))
	const reposDir = path.join(root, 'repos')
	const configPath = path.join(root, 'workshops-config.json')

	try {
		await mkdir(reposDir, { recursive: true })
		await writeFile(
			configPath,
			JSON.stringify({ reposDirectory: '/tmp/epic-workshops' }, null, 2),
		)

		const result = await cleanup({
			silent: true,
			force: true,
			targets: ['config'],
			paths: {
				reposDir,
				configPath,
				cacheDir: path.join(root, 'cache'),
				legacyCacheDir: path.join(root, 'legacy-cache'),
				offlineVideosDir: path.join(root, 'offline-videos'),
				dataPaths: [],
			},
		})

		expect(result.success).toBe(true)
		await expect(stat(configPath)).rejects.toThrow()
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
			workshops: ['sample-workshop'],
			workshopTargets: ['files'],
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

test('cleanup removes offline videos directory', async () => {
	const root = await mkdtemp(path.join(os.tmpdir(), 'epicshop-cleanup-'))
	const offlineVideosDir = path.join(root, 'offline-videos')
	const indexPath = path.join(offlineVideosDir, 'index.json')
	const videoPath = path.join(offlineVideosDir, 'video.mp4')
	const reposDir = path.join(root, 'repos')

	try {
		await mkdir(reposDir, { recursive: true })
		await mkdir(offlineVideosDir, { recursive: true })
		await writeFile(videoPath, 'video-data')
		await writeFile(
			indexPath,
			JSON.stringify(
				{
					video123: {
						playbackId: 'video123',
						fileName: 'video.mp4',
						size: 10,
						workshops: [{ id: 'workshop-1', title: 'Workshop' }],
					},
				},
				null,
				2,
			),
		)

		const result = await cleanup({
			silent: true,
			force: true,
			targets: ['offline-videos'],
			paths: { offlineVideosDir, reposDir },
		})

		expect(result.success).toBe(true)
		await expect(stat(offlineVideosDir)).rejects.toThrow()
	} finally {
		await rm(root, { recursive: true, force: true })
	}
})

test('cleanup defaults to current workshop when run inside one', async () => {
	const originalCwd = process.cwd()
	const root = await mkdtemp(path.join(os.tmpdir(), 'epicshop-cleanup-'))
	const reposDir = path.join(root, 'repos')
	const cacheDir = path.join(root, 'cache')
	const legacyCacheDir = path.join(root, 'legacy-cache')
	const offlineVideosDir = path.join(root, 'offline-videos')

	const workshopA = path.join(reposDir, 'workshop-a')
	const workshopB = path.join(reposDir, 'workshop-b')
	const workshopASubdir = path.join(workshopA, 'nested')

	const workshopAId = createHash('md5')
		.update(path.resolve(workshopA))
		.digest('hex')
	const workshopBId = createHash('md5')
		.update(path.resolve(workshopB))
		.digest('hex')
	const workshopACache = path.join(cacheDir, workshopAId)
	const workshopBCache = path.join(cacheDir, workshopBId)

	try {
		await mkdir(reposDir, { recursive: true })
		await mkdir(cacheDir, { recursive: true })
		await mkdir(legacyCacheDir, { recursive: true })

		await mkdir(workshopA, { recursive: true })
		await writeFile(
			path.join(workshopA, 'package.json'),
			JSON.stringify(
				{ name: 'workshop-a', epicshop: { title: 'Workshop A' } },
				null,
				2,
			),
		)
		await mkdir(workshopASubdir, { recursive: true })

		await mkdir(workshopB, { recursive: true })
		await writeFile(
			path.join(workshopB, 'package.json'),
			JSON.stringify(
				{ name: 'workshop-b', epicshop: { title: 'Workshop B' } },
				null,
				2,
			),
		)

		await mkdir(workshopACache, { recursive: true })
		await writeFile(path.join(workshopACache, 'cache.txt'), 'a')
		await mkdir(workshopBCache, { recursive: true })
		await writeFile(path.join(workshopBCache, 'cache.txt'), 'b')

		process.chdir(workshopASubdir)
		const result = await cleanup({
			silent: true,
			force: true,
			targets: ['workshops'],
			workshopTargets: ['caches'],
			paths: {
				reposDir,
				cacheDir,
				legacyCacheDir,
				offlineVideosDir,
				dataPaths: [],
				configPath: path.join(root, 'workshops-config.json'),
			},
		})

		expect(result.success).toBe(true)
		await expect(stat(workshopACache)).rejects.toThrow()
		await expect(stat(workshopBCache)).resolves.toBeDefined()
	} finally {
		process.chdir(originalCwd)
		await rm(root, { recursive: true, force: true })
	}
})
