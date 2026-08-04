import { expect, test, vi } from 'vitest'
import { checkNodeVersion, loadSemver } from '../node-version-check.js'

test('skips the engines check when semver failed to load (aha)', () => {
	expect(
		checkNodeVersion({
			semver: null,
			currentNodeVersion: '22.20.0',
			requiredVersions: '22 || 24 || 26',
		}),
	).toEqual({ ok: true, skipped: true })
})

test('rejects unsupported Node versions when semver is available', () => {
	expect(
		checkNodeVersion({
			semver: {
				satisfies: (version: string, range: string) =>
					version === '24.0.0' && range.includes('24'),
			},
			currentNodeVersion: '18.0.0',
			requiredVersions: '22 || 24 || 26',
		}),
	).toEqual({ ok: false, skipped: false })
})

test('loadSemver returns null when the package cannot be resolved (aha)', async () => {
	const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
	try {
		await expect(
			loadSemver(async () => {
				throw new Error(
					"Cannot find module './functions/prerelease'\nRequire stack:\n- D:\\Work\\full-stack-foundations\\epicshop\\node_modules\\@epic-web\\workshop-app\\node_modules\\semver\\index.js",
				)
			}),
		).resolves.toBeNull()
		expect(warn).toHaveBeenCalled()
	} finally {
		warn.mockRestore()
	}
})

test('loadSemver returns the package default export', async () => {
	const semver = { satisfies: () => true }
	await expect(loadSemver(async () => ({ default: semver }))).resolves.toBe(
		semver,
	)
})
