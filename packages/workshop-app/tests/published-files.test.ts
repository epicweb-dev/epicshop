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

test('npm package files include sentry-server-filters used by instrument.js (aha)', () => {
	const instrument = readFileSync(
		path.join(packageRoot, 'instrument.js'),
		'utf8',
	)
	const relativeImports = [
		...instrument.matchAll(/from\s+['"](\.\/[^'"]+)['"]/g),
	].map((match) => match[1]!.replace(/^\.\//, ''))

	expect(relativeImports.length).toBeGreaterThan(0)
	for (const relativeImport of relativeImports) {
		expect(
			packageJson.files,
			`${relativeImport} is imported by instrument.js and must be published`,
		).toEqual(expect.arrayContaining([relativeImport]))
	}
})
