import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

const packageRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'..',
)
const packageJson = JSON.parse(
	readFileSync(path.join(packageRoot, 'package.json'), 'utf8'),
) as { files: Array<string> }

function relativeImportsFrom(filename: string) {
	const source = readFileSync(path.join(packageRoot, filename), 'utf8')
	return [...source.matchAll(/from\s+['"](\.\/[^'"]+)['"]/g)].map((match) =>
		match[1]!.replace(/^\.\//, ''),
	)
}

test('npm package files include sentry-server-filters used by instrument.js (aha)', () => {
	const relativeImports = relativeImportsFrom('instrument.js')

	expect(relativeImports.length).toBeGreaterThan(0)
	for (const relativeImport of relativeImports) {
		expect(
			packageJson.files,
			`${relativeImport} is imported by instrument.js and must be published`,
		).toEqual(expect.arrayContaining([relativeImport]))
	}
})

test('npm package files include node-version-check used by start.js (aha)', () => {
	const relativeImports = relativeImportsFrom('start.js')

	expect(relativeImports).toEqual(
		expect.arrayContaining(['node-version-check.js']),
	)
	for (const relativeImport of relativeImports) {
		expect(
			packageJson.files,
			`${relativeImport} is imported by start.js and must be published`,
		).toEqual(expect.arrayContaining([relativeImport]))
	}
})
