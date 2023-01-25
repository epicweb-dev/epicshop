// Don't judge this file too harshly. It's the result of a lot of refactorings
// and I haven't had the chance to clean things up since the last one 😅

import fs from 'fs'
import path from 'path'
import cp from 'child_process'
import { getReadmeTitle } from './get-readme-title'
import { typedBoolean } from './misc'
import invariant from 'tiny-invariant'

type BaseApp = {
	name: string
	title: string
	fullPath: string
	relativePath: string
	readme: string
	portNumber: number
}

export type ExerciseApp = BaseApp & {
	type: 'exercise'
	exerciseNumber: number
}
export type FinalApp = BaseApp & { type: 'final'; exerciseNumber: number }
export type ExampleApp = BaseApp & { type: 'example' }
export type ExtraCreditExerciseApp = BaseApp & {
	type: 'extra-credit-exercise'
	exerciseNumber: number
	extraCreditNumber: number
}
export type ExtraCreditFinalApp = BaseApp & {
	type: 'extra-credit-final'
	exerciseNumber: number
	extraCreditNumber: number
}

export type ExercisePartApp =
	| ExerciseApp
	| FinalApp
	| ExtraCreditExerciseApp
	| ExtraCreditFinalApp

export type App = ExampleApp | ExercisePartApp

export function isExerciseApp(app: App): app is ExerciseApp {
	return app.type === 'exercise'
}

export function isFinalApp(app: App): app is FinalApp {
	return app.type === 'final'
}

export function isExampleApp(app: App): app is ExampleApp {
	return app.type === 'example'
}

export function isExtraCreditExerciseApp(
	app: App,
): app is ExtraCreditExerciseApp {
	return app.type === 'extra-credit-exercise'
}

export function isExtraCreditFinalApp(app: App): app is ExtraCreditFinalApp {
	return app.type === 'extra-credit-final'
}

export function isExercisePartApp(app: App): app is ExercisePartApp {
	return (
		isExerciseApp(app) ||
		isFinalApp(app) ||
		isExtraCreditExerciseApp(app) ||
		isExtraCreditFinalApp(app)
	)
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

async function readFile(file: string) {
	if (await exists(file)) {
		return fs.promises.readFile(file, 'utf8')
	}
	return ''
}

function extractExtraCreditNumber(dir: string) {
	const regex = /\.extra-(?<number>\d+)/
	const number = regex.exec(dir)?.groups?.number
	if (!number) {
		throw new Error(
			`Extra credit directory ${dir} does not match regex ${regex}`,
		)
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

export async function getSteps() {
	const apps = await getApps()
	const exercises = apps.filter(isExerciseApp)
	const finals = apps.filter(isFinalApp)
	const steps: Array<
		| ({ stepNumber: number; title: string } & {
				exercise?: ExerciseApp
				final?: FinalApp
		  })
		| undefined
	> = []
	for (const exercise of exercises) {
		steps[exercise.exerciseNumber] = {
			...steps[exercise.exerciseNumber],
			exercise,
			title: exercise.title,
			stepNumber: exercise.exerciseNumber,
		}
	}
	for (const final of finals) {
		steps[final.exerciseNumber] = {
			title: final.title,
			...steps[final.exerciseNumber],
			final,
			stepNumber: final.exerciseNumber,
		}
	}

	return steps.filter(typedBoolean)
}

export async function getApps(): Promise<Array<App>> {
	const [exerciseApps, finalApps, exampleApps] = await Promise.all([
		getExercises(),
		getFinals(),
		getExamples(),
	])
	return [...exerciseApps, ...finalApps, ...exampleApps]
}

function getPkgName(fullPath: string) {
	const pkg = require(path.join(fullPath, 'package.json'))
	invariant(pkg, `package.json must exist: ${fullPath}`)
	const { name } = pkg
	invariant(
		typeof name === 'string',
		`package.json must have a name: ${fullPath}`,
	)
	return name
}

export async function getExamples(): Promise<ExampleApp[]> {
	const workshopRoot = await getWorkshopRoot()
	return readDir(path.join(workshopRoot, 'example')).then(
		(dirs): Promise<Array<ExampleApp>> => {
			return Promise.all(
				dirs.map(async function getAppFromPath(dir, index) {
					const relativePath = path.join('example', dir)
					const fullPath = path.join(workshopRoot, relativePath)
					const readme = await readFile(path.join(fullPath, 'README.md'))
					const title = await getReadmeTitle(readme)
					return {
						name: getPkgName(fullPath),
						type: 'example',
						relativePath,
						fullPath,
						readme,
						title,
						portNumber: 5000 + index,
					}
				}),
			)
		},
	)
}

export async function getFinals(): Promise<(FinalApp | ExtraCreditFinalApp)[]> {
	const workshopRoot = await getWorkshopRoot()
	return readDir(path.join(workshopRoot, 'final')).then(
		(dirs): Promise<Array<FinalApp | ExtraCreditFinalApp>> => {
			return Promise.all(
				dirs.map(async function getAppFromPath(dir) {
					const relativePath = path.join('final', dir)
					const exerciseNumber = extractExerciseNumber(dir)
					const fullPath = path.join(workshopRoot, relativePath)
					const readme = await readFile(path.join(fullPath, 'README.md'))
					const title = await getReadmeTitle(readme)
					if (dir.includes('.extra-')) {
						const extraCreditNumber = extractExtraCreditNumber(dir)
						return {
							name: getPkgName(fullPath),
							type: 'extra-credit-final',
							exerciseNumber,
							extraCreditNumber,
							relativePath,
							fullPath,
							readme,
							title,
							portNumber: 5050 + exerciseNumber + extraCreditNumber,
						}
					} else {
						const fullPath = path.join(workshopRoot, relativePath)
						return {
							name: getPkgName(fullPath),
							type: 'final',
							relativePath,
							exerciseNumber,
							fullPath,
							readme,
							title,
							portNumber: 5000 + exerciseNumber,
						}
					}
				}),
			)
		},
	)
}

export async function getExercises(): Promise<
	(ExerciseApp | ExtraCreditExerciseApp)[]
> {
	const workshopRoot = await getWorkshopRoot()
	return readDir(path.join(workshopRoot, 'exercise')).then(
		(dirs): Promise<Array<ExerciseApp | ExtraCreditExerciseApp>> => {
			return Promise.all(
				dirs.map(async function getAppFromPath(dir) {
					const relativePath = path.join('exercise', dir)
					const exerciseNumber = extractExerciseNumber(dir)
					const fullPath = path.join(workshopRoot, relativePath)
					const readme = await readFile(path.join(fullPath, 'README.md'))
					const title = await getReadmeTitle(readme)
					if (dir.includes('.extra-')) {
						const extraCreditNumber = extractExtraCreditNumber(dir)
						return {
							name: getPkgName(fullPath),
							type: 'extra-credit-exercise',
							exerciseNumber,
							extraCreditNumber,
							relativePath,
							fullPath,
							readme,
							title,
							portNumber: 4050 + exerciseNumber + extraCreditNumber,
						}
					} else {
						return {
							name: getPkgName(fullPath),
							type: 'exercise',
							relativePath,
							exerciseNumber,
							fullPath,
							readme,
							title,
							portNumber: 4000 + exerciseNumber,
						}
					}
				}),
			)
		},
	)
}

export async function getStep(stepNumber: number | string) {
	const steps = await getSteps()
	return steps.find(s => s.stepNumber === Number(stepNumber))
}

export async function getAppFromRelativePath(relativePath: string) {
	const apps = await getApps()
	return apps.find(a => a.relativePath === relativePath)
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
