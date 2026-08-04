/**
 * Soft Node.js engines check used at workshop-app startup.
 * semver is loaded dynamically so a corrupt/incomplete install cannot take
 * down the whole process before the server boots.
 */

/**
 * @param {(specifier: string) => Promise<unknown>} [importer]
 * @returns {Promise<null | { satisfies: (version: string, range: string) => boolean }>}
 */
export async function loadSemver(importer = (specifier) => import(specifier)) {
	try {
		const mod = await importer('semver')
		const semver =
			mod && typeof mod === 'object' && 'default' in mod ? mod.default : mod
		if (
			!semver ||
			typeof semver !== 'object' ||
			typeof semver.satisfies !== 'function'
		) {
			return null
		}
		return semver
	} catch (error) {
		console.warn(
			'Failed to import semver:',
			error instanceof Error ? error.message : String(error),
			'- Node.js version check will be skipped. If startup fails for other reasons, reinstall dependencies.',
		)
		return null
	}
}

/**
 * @param {{
 * 	semver: null | { satisfies: (version: string, range: string) => boolean }
 * 	currentNodeVersion: string
 * 	requiredVersions?: string
 * 	skip?: boolean
 * }} options
 * @returns {{ ok: true, skipped: true } | { ok: true, skipped: false } | { ok: false, skipped: false }}
 */
export function checkNodeVersion({
	semver,
	currentNodeVersion,
	requiredVersions,
	skip = false,
}) {
	if (skip || !semver || !requiredVersions) {
		return { ok: true, skipped: true }
	}

	const isSupported = semver.satisfies(currentNodeVersion, requiredVersions)
	return isSupported
		? { ok: true, skipped: false }
		: { ok: false, skipped: false }
}
