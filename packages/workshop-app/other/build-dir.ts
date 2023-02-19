import fsExtra from 'fs-extra'
import path from 'path'
import glob from 'glob'
import pkg from '../package.json'
import esbuild from 'esbuild'

const dir = process.argv[2]

if (dir !== 'server' && dir !== 'utils') {
	throw new Error('Invalid directory, must be "server" or "utils"')
}

const here = (...s: Array<string>) => path.join(__dirname, ...s)
const srcDir = here('..', dir)
const destDir = here('..', `build`, dir)

const allFiles = glob
	.sync('**/*.*', {
		cwd: srcDir,
		ignore: ['**/tsconfig.json', '**/eslint*', '**/__tests__/**'],
	})
	.map(file => path.join(srcDir, file))

const entryPoints = []
for (const file of allFiles) {
	if (/\.(ts|js|tsx|jsx)$/.test(file)) {
		entryPoints.push(file)
	} else {
		const dest = file.replace(srcDir, destDir)
		fsExtra.ensureDir(path.parse(dest).dir)
		fsExtra.copySync(file, dest)
		console.log(`copied: ${file.replace(`${srcDir}/`, '')}`)
	}
}

console.log('\nbuilding...', { entryPoints })

esbuild
	.build({
		entryPoints,
		outdir: destDir,
		target: [`node${pkg.engines.node}`],
		platform: 'node',
		format: 'cjs',
		logLevel: 'info',
	})
	.then(
		res => {
			if (res.warnings.length > 0) {
				console.warn(`There were warnings`)
				for (const warning of res.warnings) {
					console.warn(warning)
				}
			}
			if (res.errors.length > 0) {
				console.error(`There were errors`)
				for (const error of res.errors) {
					console.error(error)
				}
				throw new Error('Build failed')
			}
			console.log('✅ Build succeeded')
		},
		(error: unknown) => {
			console.error(error)
			process.exit(1)
		},
	)
