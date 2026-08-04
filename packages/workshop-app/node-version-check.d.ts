export function loadSemver(
	importer?: (specifier: string) => Promise<unknown>,
): Promise<null | {
	satisfies: (version: string, range: string) => boolean
}>

export function checkNodeVersion(options: {
	semver: null | { satisfies: (version: string, range: string) => boolean }
	currentNodeVersion: string
	requiredVersions?: string
	skip?: boolean
}):
	| { ok: true; skipped: true }
	| { ok: true; skipped: false }
	| { ok: false; skipped: false }
