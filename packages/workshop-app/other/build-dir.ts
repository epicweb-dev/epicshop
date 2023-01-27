import fsExtra from 'fs-extra'
import path from 'path'
import glob from 'glob'
import pkg from '../package.json'

const dir = process.argv[2]

if (dir !== 'server' && dir !== 'components') {
	throw new Error('Invalid directory, must be "server" or "components"')
}

const here = (...s: Array<string>) => path.join(__dirname, ...s)

const allFiles = glob.sync(here(`../${dir}/**/*.*`), {
	ignore: ['**/tsconfig.json', '**/eslint*', '**/__tests__/**'],
})

const entries = []
for (const file of allFiles) {
	if (/\.(ts|js|tsx|jsx)$/.test(file)) {
		entries.push(file)
	} else {
		const dest = file.replace(here(`../${dir}`), here(`../${dir}-build`))
		fsExtra.ensureDir(path.parse(dest).dir)
		fsExtra.copySync(file, dest)
		console.log(`copied: ${file.replace(`${here(`../${dir}`)}/`, '')}`)
	}
}

console.log()
console.log('building...')

require('esbuild')
	.build({
		entryPoints: glob.sync(here(`../${dir}/**/*.+(ts|js|tsx|jsx)`)),
		outdir: here(`../${dir}-build`),
		target: [`node${pkg.engines.node}`],
		platform: 'node',
		format: 'cjs',
		logLevel: 'info',
	})
	.catch((error: unknown) => {
		console.error(error)
		process.exit(1)
	})
