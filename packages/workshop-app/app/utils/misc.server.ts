// Don't judge this file too harshly. It's the result of a lot of refactorings
// and I haven't had the chance to clean things up since the last one 😅

import fs from 'fs'
import os from 'os'
import fsExtra from 'fs-extra'
import path from 'path'
import cp from 'child_process'
import util from 'util'
import invariant from 'tiny-invariant'
import glob from 'glob'
import { BUNDLED_LANGUAGES } from 'shiki'
import parseGitDiff from 'parse-git-diff'
import { compileMdx, compileMarkdownString } from './compile-mdx.server'
import { typedBoolean } from './misc'

const kcdshopTempDir = path.join(os.tmpdir(), 'kcdshop')

const diffTmpDir = path.join(kcdshopTempDir, 'diff')

function diffPathToRelative(filePath: string) {
	// for some reason the git diff output has no leading slash on these paths
	// also, we want to get rid of the leading slash on the resulting filePath.
	return filePath.replace(`${diffTmpDir.slice(1)}/`, '')
}

const globPromise = util.promisify(glob)

type Exercise = {
	/** a unique identifier for the exercise */
	exerciseNumber: number
	/** used when displaying the list of files to match the list of apps in the file system (comes the name of the directory of the app) */
	dirName: string
	/** the title of the app used for display (comes from the first h1 in the README) */
	title: string
	instructionsCode?: string
	problems: Array<ProblemApp>
	solutions: Array<SolutionApp>
}

type BaseApp = {
	/** a unique identifier for the app (comes from package.json name prop) */
	name: string
	/** the title of the app used for display (comes from the package.json title prop) */
	title: string
	/** used when displaying the list of files to match the list of apps in the file system (comes the name of the directory of the app) */
	dirName: string
	fullPath: string
	portNumber: number
}

export type ProblemApp = BaseApp & {
	type: 'problem'
	exerciseNumber: number
	stepNumber: number
}
export type SolutionApp = BaseApp & {
	type: 'solution'
	exerciseNumber: number
	stepNumber: number
}
export type ExampleApp = BaseApp & { type: 'example' }

export type ExerciseStepApp = ProblemApp | SolutionApp

export type App = ExampleApp | ExerciseStepApp

export function isProblemApp(app: App): app is ProblemApp {
	return app.type === 'problem'
}

export function isSolutionApp(app: App): app is SolutionApp {
	return app.type === 'solution'
}

export function isFirstStepProblemApp(
	app: App,
): app is ProblemApp & { stepNumber: 1 } {
	return isProblemApp(app) && app.stepNumber === 1
}

export function isFirstStepSolutionApp(
	app: App,
): app is SolutionApp & { stepNumber: 1 } {
	return isSolutionApp(app) && app.stepNumber === 1
}

export function isExampleApp(app: App): app is ExampleApp {
	return app.type === 'example'
}

export function isExerciseStepApp(app: App): app is ExerciseStepApp {
	return isProblemApp(app) || isSolutionApp(app)
}

async function exists(dir: string) {
	return Boolean(await fs.promises.stat(dir).catch(() => false))
}

async function readDir(dir: string) {
	if (await exists(dir)) {
		return fs.promises.readdir(dir)
	}
	return []
}

async function compileReadme(appDir: string) {
	const readmeFilepath = path.join(appDir, 'README.md')
	if (await exists(readmeFilepath)) {
		const compiled = await compileMdx(readmeFilepath)
		return compiled
	}
	return null
}

function extractStepNumber(dir: string) {
	const regex = /\.step-(?<number>\d+)/
	const number = regex.exec(dir)?.groups?.number
	if (!number) {
		return null
	}
	return Number(number)
}

function extractExerciseNumber(dir: string) {
	const regex = /^(?<number>\d+)-/
	const number = regex.exec(dir)?.groups?.number
	if (!number) {
		throw new Error(`Exercise directory ${dir} does not match regex ${regex}`)
	}
	return Number(number)
}

export async function getExercises(): Promise<Array<Exercise>> {
	const workshopRoot = await getWorkshopRoot()
	const apps = await getApps()
	const exerciseDirs = await readDir(path.join(workshopRoot, 'exercises'))
	const exercises: Array<Exercise> = await Promise.all(
		exerciseDirs.map(async dirName => {
			const exerciseNumber = extractExerciseNumber(dirName)
			const compiledReadme = await compileReadme(
				path.join(workshopRoot, 'exercises', dirName),
			)
			return {
				exerciseNumber,
				dirName,
				instructionsCode: compiledReadme?.code,
				title: compiledReadme?.title ?? dirName,
				problems: apps
					.filter(isProblemApp)
					.filter(app => app.exerciseNumber === exerciseNumber),
				solutions: apps
					.filter(isSolutionApp)
					.filter(app => app.exerciseNumber === exerciseNumber),
			}
		}),
	)
	return exercises
}

export async function getApps(): Promise<Array<App>> {
	const [problemApps, solutionApps, exampleApps] = await Promise.all([
		getProblemApps(),
		getSolutionApps(),
		getExampleApps(),
	])
	return [...problemApps, ...solutionApps, ...exampleApps].sort((a, b) => {
		if (isExampleApp(a)) {
			if (isExampleApp(b)) return a.name.localeCompare(b.name)
			else return 1
		}
		if (isExampleApp(b)) return -1

		if (a.type === b.type) {
			if (a.exerciseNumber === b.exerciseNumber) {
				return a.stepNumber - b.stepNumber
			} else {
				return a.exerciseNumber - b.exerciseNumber
			}
		}

		// at this point, we know that a and b are different types...
		if (isProblemApp(a)) {
			if (a.exerciseNumber === b.exerciseNumber) {
				return a.stepNumber <= b.stepNumber ? 1 : -1
			} else {
				return a.exerciseNumber <= b.exerciseNumber ? 1 : -1
			}
		}
		if (isSolutionApp(a)) {
			if (a.exerciseNumber === b.exerciseNumber) {
				return a.stepNumber < b.stepNumber ? -1 : 1
			} else {
				return a.exerciseNumber < b.exerciseNumber ? -1 : 1
			}
		}
		console.error('unhandled sorting case', a, b)
		return 0
	})
}

function getPkgProp(
	fullPath: string,
	prop: string,
	defaultValue?: string,
): string {
	const pkg = require(path.join(fullPath, 'package.json'))
	invariant(pkg, `package.json must exist: ${fullPath}`)
	const value = pkg[prop]
	if (value === undefined && defaultValue) {
		return defaultValue
	}
	return value
}

export async function getExampleApps(): Promise<Array<ExampleApp>> {
	const workshopRoot = await getWorkshopRoot()
	return readDir(path.join(workshopRoot, 'example')).then(
		(dirs): Promise<Array<ExampleApp>> => {
			return Promise.all(
				dirs.map(async function getAppFromPath(dirName, index) {
					const relativePath = path.join('example', dirName)
					const fullPath = path.join(workshopRoot, relativePath)
					const compiledReadme = await compileReadme(fullPath)
					const name = getPkgProp(fullPath, 'name', dirName)
					return {
						name,
						type: 'example',
						relativePath,
						fullPath,
						title: compiledReadme?.title ?? name,
						dirName,
						portNumber: 3500 + index,
					}
				}),
			)
		},
	)
}

export async function getSolutionApps(): Promise<Array<SolutionApp>> {
	const workshopRoot = await getWorkshopRoot()
	const solutionDirs = await globPromise(
		path.join(workshopRoot, 'exercises', '**', 'solution*'),
	)
	const solutionApps = await Promise.all(
		solutionDirs.map(async function getAppFromPath(
			fullPath,
		): Promise<SolutionApp> {
			const dirName = path.basename(fullPath)
			const parentDirName = path.basename(path.dirname(fullPath))
			const exerciseNumber = extractExerciseNumber(parentDirName)
			const name = getPkgProp(fullPath, 'name', dirName)
			const title = getPkgProp(fullPath, 'title', dirName)
			const stepNumber = extractStepNumber(dirName) ?? 1
			const portNumber = 5000 + exerciseNumber * 10 + stepNumber
			return {
				name,
				title,
				type: 'solution',
				exerciseNumber,
				stepNumber,
				portNumber,
				dirName,
				fullPath,
			}
		}),
	)
	return solutionApps
}

export async function getProblemApps(): Promise<Array<ProblemApp>> {
	const workshopRoot = await getWorkshopRoot()
	const problemDirs = await globPromise(
		path.join(workshopRoot, 'exercises', '**', 'problem*'),
	)
	const problemApps = await Promise.all(
		problemDirs.map(async function getAppFromPath(
			fullPath,
		): Promise<ProblemApp> {
			const dirName = path.basename(fullPath)
			const parentDirName = path.basename(path.dirname(fullPath))
			const exerciseNumber = extractExerciseNumber(parentDirName)
			const name = getPkgProp(fullPath, 'name', dirName)
			const title = getPkgProp(fullPath, 'title', dirName)
			const stepNumber = extractStepNumber(dirName) ?? 1
			const portNumber = 5000 + exerciseNumber * 10 + stepNumber
			return {
				name,
				title,
				type: 'problem',
				exerciseNumber,
				stepNumber,
				portNumber,
				dirName,
				fullPath,
			}
		}),
	)
	return problemApps
}

export async function getExercise(exerciseNumber: number | string) {
	const exercises = await getExercises()
	return exercises.find(s => s.exerciseNumber === Number(exerciseNumber))
}

export async function requireExerciseApp({
	type = 'problem',
	exerciseNumber: exerciseNumberString,
	stepNumber: stepNumberString = '1',
}: {
	type?: string
	exerciseNumber?: string
	stepNumber?: string
}) {
	if ((type !== 'problem' && type !== 'solution') || !exerciseNumberString) {
		throw new Response('Not found', { status: 404 })
	}

	const stepNumber = Number(stepNumberString)
	const exerciseNumber = Number(exerciseNumberString)

	const apps = await getApps()
	const app = apps.find(app => {
		if (isExampleApp(app)) return false
		return (
			app.exerciseNumber === exerciseNumber &&
			app.stepNumber === stepNumber &&
			app.type === type
		)
	})
	if (!app) {
		throw new Response('Not found', { status: 404 })
	}
	return app
}

export async function getAppByName(name: string) {
	const apps = await getApps()
	return apps.find(a => a.name === name)
}

export async function getNextApp(app: App) {
	const apps = await getApps()
	const index = apps.findIndex(a => a.name === app.name)
	if (index === -1) {
		throw new Error(`Could not find app ${app.name}`)
	}
	const nextApp = apps[index + 1]
	return nextApp ? nextApp : null
}

function getLanguage(ext: string) {
	return (
		BUNDLED_LANGUAGES.find(l => l.id === ext || l.aliases?.includes(ext))?.id ??
		'text'
	)
}

async function copyUnignoredFiles(srcDir: string, destDir: string) {
	const { execa } = await import('execa')
	function isIgnored(filepath: string) {
		return execa('git', ['check-ignore', filepath], { cwd: srcDir }).then(
			() => true,
			() => false,
		)
	}

	await fsExtra.copy(srcDir, destDir, {
		filter: async file => {
			if (file === srcDir) return true
			return isIgnored(file).then(ignored => !ignored)
		},
	})
}

function getFileCodeblocks(
	file: ReturnType<typeof parseGitDiff>['files'][number],
) {
	if (!file.chunks.length) {
		return [`No changes`]
	}
	const filepath = file.type === 'RenamedFile' ? file.pathAfter : file.path
	const extension = path.extname(filepath).slice(1)
	const lang = getLanguage(extension)
	const markdownLines = []
	for (const chunk of file.chunks) {
		const removedLineNumbers = []
		const addedLineNumbers = []
		const lines = []
		const startLine = chunk.toFileRange.start
		for (let lineNumber = 0; lineNumber < chunk.changes.length; lineNumber++) {
			const change = chunk.changes[lineNumber]
			lines.push(change.content)
			switch (change.type) {
				case 'AddedLine': {
					addedLineNumbers.push(startLine + lineNumber)
					break
				}
				case 'DeletedLine': {
					removedLineNumbers.push(startLine + lineNumber)
					break
				}
			}
		}

		const params = new URLSearchParams(
			[
				['filename', diffPathToRelative(filepath)],
				['start', startLine.toString()],
				removedLineNumbers.length
					? ['remove', removedLineNumbers.join(',')]
					: null,
				addedLineNumbers.length ? ['add', addedLineNumbers.join(',')] : null,
			].filter(typedBoolean),
		)
			.toString()
			.replace('&', ' ')

		markdownLines.push(`
\`\`\`${lang} ${params}
${lines.join('\n')}
\`\`\`
`)
	}
	return markdownLines
}

export async function getDiffCode(app1: App, app2: App) {
	const { execa } = await import('execa')
	// copy non-gitignored files from the apps to a temp directory
	await fsExtra.emptyDir(diffTmpDir)
	const app1CopyPath = path.join(diffTmpDir, 'app1')
	const app2CopyPath = path.join(diffTmpDir, 'app2')
	await copyUnignoredFiles(app1.fullPath, app1CopyPath)
	await copyUnignoredFiles(app2.fullPath, app2CopyPath)

	const { stdout: diffOutput } = await execa(
		'git',
		[
			'diff',
			'--no-index',
			app1CopyPath,
			app2CopyPath,
			'--color=never',
			'--color-moved-ws=allow-indentation-change',
			'--no-prefix',
		],
		{ cwd: diffTmpDir },
		// --no-index implies --exit-code, so we need to ignore the error
	).catch(e => e)

	const parsed = parseGitDiff(diffOutput)

	let markdownLines = [
		`
# Diff

\`${app1.name}\` vs \`${app2.name}\`
`,
	]
	for (const file of parsed.files) {
		switch (file.type) {
			case 'ChangedFile': {
				markdownLines.push(`
<details>

<summary>➕/➖ \`${diffPathToRelative(file.path)}\`</summary>

${getFileCodeblocks(file).join('\n')}

</details>
`)
				break
			}
			case 'DeletedFile': {
				markdownLines.push(`
<details>

<summary>➖ \`${diffPathToRelative(file.path)}\` (file deleted)</summary>

${getFileCodeblocks(file).join('\n')}

</details>
`)
				break
			}
			case 'RenamedFile': {
				markdownLines.push(`
<details>

<summary>\`${diffPathToRelative(file.pathBefore)}\` ▶️ \`${diffPathToRelative(
					file.pathAfter,
				)}\` (file renamed)</summary>

${getFileCodeblocks(file).join('\n')}

</details>
`)
				break
			}
			case 'AddedFile': {
				markdownLines.push(`
<details>

<summary>➕ \`${diffPathToRelative(file.path)}\` (file added)</summary>

${getFileCodeblocks(file).join('\n')}

</details>
`)
				break
			}
			default: {
				console.error(file)
				throw new Error(`Unknown file type: ${file}`)
			}
		}
	}
	const code = await compileMarkdownString(markdownLines.join('\n'))
	return code
}

export async function getWorkshopRoot() {
	const context = process.env.KCDSHOP_CONTEXT_CWD ?? process.cwd()
	const { root: rootDir } = path.parse(context)
	let repoRoot = context
	while (repoRoot !== rootDir) {
		const pkgPath = path.join(repoRoot, 'package.json')
		if (await exists(pkgPath)) {
			const pkg = require(pkgPath)
			if (pkg['kcd-workshop']?.root) {
				return repoRoot
			}
		}
		repoRoot = path.dirname(repoRoot)
	}
	throw new Error(
		`Workshop Root not found. Make sure the root of the workshop has "kcd-workshop" and "root: true" in the package.json.`,
	)
}

export async function getWorkshopTitle() {
	const workshopRoot = await getWorkshopRoot()
	const pkg = require(path.join(workshopRoot, 'package.json'))
	invariant(
		typeof pkg.title === 'string',
		'workshop root package.json must have a title property.',
	)
	return pkg.title
}

export async function runInDirs(script: string, dirs: Array<string> = []) {
	if (!dirs.length) {
		dirs = (await getApps()).map(app => app.fullPath)
	}
	console.log(`🏎  "${script}":\n- ${dirs.join('\n- ')}\n`)

	for (const dir of dirs) {
		console.log(`🏎  ${script} in ${dir}`)
		cp.execSync(script, { cwd: dir, stdio: 'inherit' })
	}
}

export async function exec(command: string) {
	const child = cp.spawn(command, { shell: true, stdio: 'inherit' })
	await new Promise((res, rej) => {
		child.on('exit', code => {
			if (code === 0) {
				res(code)
			} else {
				rej()
			}
		})
	})
}
