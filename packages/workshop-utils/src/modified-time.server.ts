import './init-env.ts'

import fs from 'node:fs'
import path from 'node:path'
import { isGitIgnored } from 'globby'
import PQueue from 'p-queue'
import { z } from 'zod'
import { cachified, dirModifiedTimeCache } from './cache.server.ts'

async function getDirModifiedTime(
	dir: string,
	{ forceFresh = false }: { forceFresh?: boolean } = {},
): Promise<number> {
	const result = await cachified({
		key: dir,
		cache: dirModifiedTimeCache,
		ttl: 200,
		forceFresh,
		checkValue: z.number(),
		getFreshValue: () => getDirModifiedTimeImpl(dir),
	})
	return result
}

async function getDirModifiedTimeImpl(dir: string): Promise<number> {
	const isIgnored = await isGitIgnored({ cwd: dir }).catch(() => () => false)
	const files = await fs.promises
		.readdir(dir, { withFileTypes: true })
		.catch(() => [])

	const modifiedTimes: Array<number> = []

	for (const file of files) {
		// Skip ignored files
		if (isIgnored(path.join(dir, file.name))) continue

		const filePath = path.join(dir, file.name)

		if (file.isDirectory()) {
			modifiedTimes.push(await getDirModifiedTime(filePath))
		} else {
			try {
				const { mtimeMs } = await fs.promises.stat(filePath)
				modifiedTimes.push(mtimeMs)
			} catch {
				// ignore errors (e.g., file access permissions, file has been moved or deleted)
			}
		}
	}

	try {
		const { mtimeMs } = await fs.promises.stat(dir)
		modifiedTimes.push(mtimeMs)
	} catch {
		// ignore errors (e.g., file access permissions, file has been moved or deleted)
	}

	return Math.max(-1, ...modifiedTimes)
}

// this will return true as soon as one of the directories has been found to
// have been modified more recently than the given time
// TODO: this could be improved by not waiting for entire directories to be
// scanned and instead stopping the scan as soon as we find a file that was
// modified more recently than the given time
export async function modifiedMoreRecentlyThan(
	time: number,
	...dirs: Array<string>
) {
	const modifiedTimePromises = dirs.map((dir) => getDirModifiedTime(dir))
	const allFinishedPromise = Promise.all(modifiedTimePromises)
	const firstMoreRecentPromise = modifiedTimePromises.map((p) =>
		p.then((t) => (t > time ? true : allFinishedPromise.then(() => false))),
	)
	const firstMoreRecent = await Promise.race(firstMoreRecentPromise)
	return firstMoreRecent
}

let _queue: PQueue | null = null
function getQueue() {
	if (_queue) return _queue

	_queue = new PQueue({
		concurrency: 10,
		timeout: 1000 * 60,
	})
	return _queue
}

// We have to use a queue because we can't run more than one of these at a time
// or we'll hit an out of memory error because esbuild uses a lot of memory...
async function queuedGetDirModifiedTime(
	...args: Parameters<typeof getDirModifiedTime>
) {
	const queue = getQueue()
	const result = await queue.add(() => getDirModifiedTime(...args))
	return result || -1
}

export { queuedGetDirModifiedTime as getDirModifiedTime }
