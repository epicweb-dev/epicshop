import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import fsExtra from 'fs-extra'
import { expect, test } from 'vitest'
import {
	ensureWorkshopCacheMetadataFile,
	readWorkshopCacheMetadataFile,
} from './workshop-cache-metadata.server.ts'

async function createTempDir(prefix: string) {
	return await fs.mkdtemp(path.join(os.tmpdir(), prefix))
}

test('readWorkshopCacheMetadataFile returns null when missing', async () => {
	const tmp = await createTempDir('epicshop-cache-meta-missing-')
	try {
		await expect(
			readWorkshopCacheMetadataFile({
				cacheDir: path.join(tmp, 'cache'),
				workshopId: '0123456789abcdef0123456789abcdef',
			}),
		).resolves.toBeNull()
	} finally {
		await fsExtra.remove(tmp)
	}
})

test('ensureWorkshopCacheMetadataFile writes metadata and is readable', async () => {
	const tmp = await createTempDir('epicshop-cache-meta-write-')
	try {
		const cacheDir = path.join(tmp, 'cache')
		const workshopId = '0123456789abcdef0123456789abcdef'

		const created = await ensureWorkshopCacheMetadataFile({
			cacheDir,
			workshopId,
			displayName: 'Test Workshop',
			repoName: 'test-workshop',
			subtitle: 'A test subtitle',
		})

		expect(created?.schemaVersion).toBe(1)
		expect(created?.workshopId).toBe(workshopId)
		expect(created?.displayName).toBe('Test Workshop')
		expect(created?.repoName).toBe('test-workshop')
		expect(created?.subtitle).toBe('A test subtitle')
		expect(created?.createdAt).toEqual(expect.any(Number))

		await expect(
			readWorkshopCacheMetadataFile({ cacheDir, workshopId }),
		).resolves.toEqual(created)
	} finally {
		await fsExtra.remove(tmp)
	}
})

test('ensureWorkshopCacheMetadataFile does not overwrite existing metadata', async () => {
	const tmp = await createTempDir('epicshop-cache-meta-no-overwrite-')
	try {
		const cacheDir = path.join(tmp, 'cache')
		const workshopId = '0123456789abcdef0123456789abcdef'

		const first = await ensureWorkshopCacheMetadataFile({
			cacheDir,
			workshopId,
			displayName: 'First Title',
			repoName: 'first',
		})

		const second = await ensureWorkshopCacheMetadataFile({
			cacheDir,
			workshopId,
			displayName: 'Second Title',
			repoName: 'second',
		})

		expect(second).toEqual(first)
	} finally {
		await fsExtra.remove(tmp)
	}
})
