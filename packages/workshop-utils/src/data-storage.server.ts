import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

const APP_NAME = 'epicshop'
const FILE_NAME = 'data.json'

export function resolvePrimaryDir(appName = APP_NAME) {
	const p = process.platform
	if (p === 'darwin') {
		return path.join(os.homedir(), 'Library', 'Application Support', appName)
	}
	if (p === 'win32') {
		const base =
			process.env.LOCALAPPDATA ||
			process.env.APPDATA ||
			path.join(os.homedir(), 'AppData', 'Local')
		return path.join(base, appName)
	}
	const base =
		process.env.XDG_STATE_HOME || path.join(os.homedir(), '.local', 'state')
	return path.join(base, appName)
}

export function resolveCacheDir(appName = APP_NAME) {
	const p = process.platform
	if (p === 'darwin') {
		return path.join(os.homedir(), 'Library', 'Caches', appName)
	}
	if (p === 'win32') {
		const base =
			process.env.LOCALAPPDATA ||
			process.env.APPDATA ||
			path.join(os.homedir(), 'AppData', 'Local')
		return path.join(base, appName, 'Cache')
	}
	const base = process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache')
	return path.join(base, appName)
}

export function resolvePrimaryPath(appName = APP_NAME, fileName = FILE_NAME) {
	return path.join(resolvePrimaryDir(appName), fileName)
}

export function resolveFallbackPath(appName = APP_NAME, fileName = FILE_NAME) {
	const dir = path.join(os.tmpdir(), appName)
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

export async function saveJSON(
	appName = APP_NAME,
	fileName = FILE_NAME,
	data: unknown,
) {
	const primary = resolvePrimaryPath(appName, fileName)
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

		const fallback = resolveFallbackPath(appName, fileName)
		await ensureDir(path.dirname(fallback))
		await atomicWriteJSON(fallback, data)
		return { path: fallback, fallbackUsed: true }
	}
}

export async function loadJSON<T = unknown>(
	appName = APP_NAME,
	fileName = FILE_NAME,
) {
	const candidates = [
		resolvePrimaryPath(appName, fileName),
		resolveFallbackPath(appName, fileName),
	]
	for (const p of candidates) {
		try {
			const txt = await fs.readFile(p, 'utf8')
			return { path: p, data: JSON.parse(txt) as T | null }
		} catch {}
	}
	return { path: resolvePrimaryPath(appName, fileName), data: null }
}

export async function migrateLegacyDotfile(
	appName = APP_NAME,
	fileName = FILE_NAME,
) {
	const legacyDir = path.join(os.homedir(), '.epicshop')
	const legacyPath = path.join(legacyDir, fileName)
	const primaryPath = resolvePrimaryPath(appName, fileName)

	try {
		const stat = await fs.stat(legacyPath)
		if (!stat.isFile()) return { migrated: false, reason: 'not-a-file' }
		const data = await fs.readFile(legacyPath, 'utf8')

		await ensureDir(path.dirname(primaryPath))
		// Write new first (atomic), then remove old to minimize data-loss window
		await atomicWriteJSON(primaryPath, JSON.parse(data))
		try {
			await fs.chmod(primaryPath, 0o600)
		} catch {}
		try {
			await fs.unlink(legacyPath)
			// Optionally remove empty legacy dir (ignore errors)
			await fs.rmdir(legacyDir)
		} catch {}
		return { migrated: true, path: primaryPath }
	} catch (err: any) {
		// If we can't read due to perms, surface info and continue
		if (err?.code === 'EACCES' || err?.code === 'EPERM') {
			return {
				migrated: false,
				reason: 'unreadable',
				message:
					`Legacy file exists but is unreadable: ${legacyPath}. ` +
					`You can fix ownership or manually import it in-app.`,
			}
		}
		return { migrated: false, reason: 'missing-or-other' }
	}
}
