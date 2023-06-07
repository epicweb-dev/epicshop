import fsExtra from 'fs-extra'
import path from 'path'
import { fileURLToPath } from 'url'
import { globSync } from 'glob'
import esbuild from 'esbuild'

const pkg = fsExtra.readJsonSync(path.join(process.cwd(), 'package.json'))

const dir = process.argv[2]

if (dir !== 'server' && dir !== 'utils') {
	throw new Error('Invalid directory, must be "server" or "utils"')
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const here = (...s: Array<string>) => path.join(__dirname, ...s)
const srcDir = here('..', dir)
const destDir = here('..', `build`, dir)

const ignore = ['**/tsconfig.json', '**/eslint*', '**/__tests__/**']
if (dir === 'server') {
	// for development only
	ignore.push('dev-server.js')
}

const allFiles = globSync('**/*.*', { cwd: srcDir, ignore }).map(file =>
	path.join(srcDir, file),
)

const entryPoints = []
for (const file of allFiles) {
	if (/\.(ts|js|tsx|jsx)$/.test(file)) {
		entryPoints.push(file.replace(/\\/g, '/'))
	} else {
		const dest = file.replace(srcDir, destDir)
		fsExtra.ensureDir(path.parse(dest).dir)
		fsExtra.copySync(file, dest)
		console.log(`copied: ${file.replace(`${srcDir}${path.sep}`, '')}`)
	}
}

console.log('\nbuilding...', { entryPoints })

function replacer(_: string, p1: string, p2: string, p3: string) {
	return p1 + p2.replace(/\.ts(x?)/, '.js$1') + p3
}

const replaceImportExtension: esbuild.Plugin = {
	name: 'replace-import-extension',
	setup(build) {
		build.onLoad({ filter: /\.tsx?$/ }, async args => {
			const source = await fsExtra.readFile(args.path, 'utf8')
			// import/export
			const re1 =
				/((?:import|export).*\s?(?:{[\s\S]*?\})?\s*from\s*["'`])(.*)(["'`])/g
			// dynamic import
			const re2 = /(import\n?\s?\(\n?.*)\.ts(x?["'`]\n?\))/g
			let contents = source.replace(re1, replacer).replace(re2, '$1.j$2')
			// import ../build/index.js
			if (dir === 'server' && /server[\\/]index\.ts/.test(args.path)) {
				contents = contents.replace(
					RegExp('../build/index.js', 'g'),
					'../index.js',
				)
			}
			return { contents, loader: 'default' }
		})
	},
}

const config: esbuild.BuildOptions = {
	entryPoints,
	outdir: destDir,
	target: [`node${pkg.engines.node}`],
	platform: 'node',
	format: 'esm',
	logLevel: 'info',
	plugins: [replaceImportExtension],
}

try {
	const res = await esbuild.build(config)
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
} catch (error: unknown) {
	console.error(error)
	process.exit(1)
}
