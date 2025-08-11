import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

const APP_NAME = 'epicshop'
const FILE_NAME = 'data.json'

export function resolvePrimaryDir() {
	const p = process.platform
	if (p === 'darwin') {
		return path.join(os.homedir(), 'Library', 'Application Support', APP_NAME)
	}
	if (p === 'win32') {
		const base =
			process.env.LOCALAPPDATA ||
			process.env.APPDATA ||
			path.join(os.homedir(), 'AppData', 'Local')
		return path.join(base, APP_NAME)
	}
	const base =
		process.env.XDG_STATE_HOME || path.join(os.homedir(), '.local', 'state')
	return path.join(base, APP_NAME)
}

export function resolveCacheDir() {
	const p = process.platform
	if (p === 'darwin') {
		return path.join(os.homedir(), 'Library', 'Caches', APP_NAME)
	}
	if (p === 'win32') {
		const base =
			process.env.LOCALAPPDATA ||
			process.env.APPDATA ||
			path.join(os.homedir(), 'AppData', 'Local')
		return path.join(base, APP_NAME, 'Cache')
	}
	const base = process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache')
	return path.join(base, APP_NAME)
}

export function resolvePrimaryPath(fileName = FILE_NAME) {
	return path.join(resolvePrimaryDir(), fileName)
}

export function resolveFallbackPath(fileName = FILE_NAME) {
	const dir = path.join(os.tmpdir(), APP_NAME)
	return path.join(dir, fileName)
}

async function ensureDir(dir: string) {
	try {
		await fs.mkdir(dir, { recursive: true, mode: 0o700 })
	} catch {}
	try {
		await fs.chmod(dir, 0o700)
	} catch {}
}

async function atomicWriteJSON(filePath: string, data: unknown) {
	const dir = path.dirname(filePath)
	await ensureDir(dir)
	const tmp = path.join(dir, `.tmp-${randomUUID()}`)
	await fs.writeFile(tmp, JSON.stringify(data, null, 2), { mode: 0o600 })
	await fs.rename(tmp, filePath)
}

export async function saveJSON(data: unknown) {
	const primary = resolvePrimaryPath(FILE_NAME)
	try {
		await atomicWriteJSON(primary, data)
		return { path: primary, fallbackUsed: false }
	} catch (err: any) {
		if (err?.code !== 'EACCES' && err?.code !== 'EPERM') throw err

		// Wrong ownership or preexisting read-only file; try to replace it once
		try {
			await fs.unlink(primary)
			await atomicWriteJSON(primary, data)
			return { path: primary, fallbackUsed: false }
		} catch {}

		const fallback = resolveFallbackPath(FILE_NAME)
		await ensureDir(path.dirname(fallback))
		await atomicWriteJSON(fallback, data)
		return { path: fallback, fallbackUsed: true }
	}
}

export async function loadJSON<T = unknown>() {
	const candidates = [
		resolvePrimaryPath(FILE_NAME),
		resolveFallbackPath(FILE_NAME),
	]
	for (const p of candidates) {
		try {
			const txt = await fs.readFile(p, 'utf8')
			return { path: p, data: JSON.parse(txt) as T | null }
		} catch {}
	}
	return { path: resolvePrimaryPath(FILE_NAME), data: null }
}

export async function migrateLegacyData() {
	const legacyDir = path.join(os.homedir(), '.epicshop')
	const legacyDataPath = path.join(legacyDir, FILE_NAME)
	const legacyCachePath = path.join(legacyDir, 'cache')
	const primaryDataPath = resolvePrimaryPath(FILE_NAME)
	const primaryCachePath = resolveCacheDir()

	try {
		// Check if legacy directory exists
		const legacyDirStat = await fs.stat(legacyDir)
		if (!legacyDirStat.isDirectory()) {
			return
		}

		// Migrate data file if it exists
		try {
			const dataStat = await fs.stat(legacyDataPath)
			if (dataStat.isFile()) {
				await ensureDir(path.dirname(primaryDataPath))
				await fs.rename(legacyDataPath, primaryDataPath)
				try {
					await fs.chmod(primaryDataPath, 0o600)
				} catch {}
			}
		} catch (err: any) {
			// Log permission errors but continue with other migrations
			if (err?.code === 'EACCES' || err?.code === 'EPERM') {
				console.warn(
					`Legacy data file exists but is unreadable: ${legacyDataPath}. You can fix ownership or manually import it in-app.`,
				)
			}
		}

		// Migrate cache directory if it exists
		try {
			const cacheStat = await fs.stat(legacyCachePath)
			if (cacheStat.isDirectory()) {
				await ensureDir(path.dirname(primaryCachePath))
				await fs.rename(legacyCachePath, primaryCachePath)
				try {
					await fs.chmod(primaryCachePath, 0o700)
				} catch {}
			}
		} catch (err: any) {
			// Log permission errors but continue with other migrations
			if (err?.code === 'EACCES' || err?.code === 'EPERM') {
				console.warn(
					`Legacy cache directory exists but is unreadable: ${legacyCachePath}. You can fix ownership or manually move it.`,
				)
			}
		}

		// Try to remove the legacy directory if it's empty
		try {
			const remainingFiles = await fs.readdir(legacyDir)
			if (remainingFiles.length === 0) {
				await fs.rmdir(legacyDir)
			}
		} catch {}
	} catch (err: any) {
		// If we can't access the legacy directory at all, log and continue
		if (err?.code === 'EACCES' || err?.code === 'EPERM') {
			console.warn(
				`Legacy directory exists but is unreadable: ${legacyDir}. You can fix delete it and start fresh, fix ownership, or manually migrate the data.`,
			)
		}
	}
}
