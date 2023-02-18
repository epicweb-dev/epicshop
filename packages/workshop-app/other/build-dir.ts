import fsExtra from 'fs-extra'
import path from 'path'
import glob from 'glob'
import pkg from '../package.json'

const dir = process.argv[2]

if (dir !== 'server' && dir !== 'utils') {
	throw new Error('Invalid directory, must be "server" or "utils"')
}

const here = (...s: Array<string>) => path.join(__dirname, ...s)
const srcDir = here('..', dir)
const destDir = here('..', `build`, dir)

const allFiles = glob.sync(path.join(srcDir, '**', '*.*'), {
	ignore: ['**/tsconfig.json', '**/eslint*', '**/__tests__/**'],
})

const entries = []
for (const file of allFiles) {
	if (/\.(ts|js|tsx|jsx)$/.test(file)) {
		entries.push(file)
	} else {
		const dest = file.replace(srcDir, destDir)
		fsExtra.ensureDir(path.parse(dest).dir)
		fsExtra.copySync(file, dest)
		console.log(`copied: ${file.replace(`${srcDir}/`, '')}`)
	}
}

console.log('\nbuilding...')

require('esbuild')
	.build({
		entryPoints: glob.sync(path.join(srcDir, '**', '*.+(ts|js|tsx|jsx)')),
		outdir: destDir,
		target: [`node${pkg.engines.node}`],
		platform: 'node',
		format: 'cjs',
		logLevel: 'info',
	})
	.catch((error: unknown) => {
		console.error(error)
		process.exit(1)
	})
