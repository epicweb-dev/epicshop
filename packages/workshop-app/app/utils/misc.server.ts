// Don't judge this file too harshly. It's the result of a lot of refactorings
// and I haven't had the chance to clean things up since the last one 😅

import fs from 'fs'
import path from 'path'
import cp from 'child_process'
import { typedBoolean } from './misc'
import invariant from 'tiny-invariant'
import { compileMdx } from './compile-mdx.server'

type BaseApp = {
	name: string
	title: string
	fullPath: string
	relativePath: string
	instructionsCode?: string
	portNumber: number
}

export type ExerciseApp = BaseApp & {
	type: 'exercise'
	exerciseNumber: number
	stepNumber: 1
}
export type FinalApp = BaseApp & {
	type: 'final'
	exerciseNumber: number
	stepNumber: 1
}
export type ExampleApp = BaseApp & { type: 'example' }
export type StepExerciseApp = BaseApp & {
	type: 'step-exercise'
	exerciseNumber: number
	stepNumber: number
}
export type StepFinalApp = BaseApp & {
	type: 'step-final'
	exerciseNumber: number
	stepNumber: number
}

export type ExercisePartApp =
	| ExerciseApp
	| FinalApp
	| StepExerciseApp
	| StepFinalApp

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

export function isStepExerciseApp(app: App): app is StepExerciseApp {
	return app.type === 'step-exercise'
}

export function isStepFinalApp(app: App): app is StepFinalApp {
	return app.type === 'step-final'
}

export function isExercisePartApp(app: App): app is ExercisePartApp {
	return (
		isExerciseApp(app) ||
		isFinalApp(app) ||
		isStepExerciseApp(app) ||
		isStepFinalApp(app)
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
		throw new Error(`Step directory ${dir} does not match regex ${regex}`)
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

export async function getTopics() {
	const apps = await getApps()
	const exercises = apps.filter(isExerciseApp)
	const finals = apps.filter(isFinalApp)
	const topics: Array<
		| ({ topicNumber: number; title: string } & {
				exercise?: ExerciseApp
				final?: FinalApp
		  })
		| undefined
	> = []
	for (const exercise of exercises) {
		topics[exercise.exerciseNumber] = {
			...topics[exercise.exerciseNumber],
			exercise,
			title: exercise.title,
			topicNumber: exercise.exerciseNumber,
		}
	}
	for (const final of finals) {
		topics[final.exerciseNumber] = {
			title: final.title,
			...topics[final.exerciseNumber],
			final,
			topicNumber: final.exerciseNumber,
		}
	}

	return topics.filter(typedBoolean)
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
					const compiledReadme = await compileReadme(fullPath)
					const name = getPkgName(fullPath)
					return {
						name,
						type: 'example',
						relativePath,
						fullPath,
						instructionsCode: compiledReadme?.code,
						title: compiledReadme?.title ?? name,
						portNumber: 5000 + index,
					}
				}),
			)
		},
	)
}

export async function getFinals(): Promise<(FinalApp | StepFinalApp)[]> {
	const workshopRoot = await getWorkshopRoot()
	return readDir(path.join(workshopRoot, 'final')).then(
		(dirs): Promise<Array<FinalApp | StepFinalApp>> => {
			return Promise.all(
				dirs.map(async function getAppFromPath(dir) {
					const relativePath = path.join('final', dir)
					const exerciseNumber = extractExerciseNumber(dir)
					const fullPath = path.join(workshopRoot, relativePath)
					const compiledReadme = await compileReadme(fullPath)
					const name = getPkgName(fullPath)
					const isFirstStep =
						!dir.includes('.step-') || dir.includes('.step-01')
					if (isFirstStep) {
						return {
							name,
							type: 'final',
							stepNumber: 1,
							relativePath,
							exerciseNumber,
							fullPath,
							instructionsCode: compiledReadme?.code,
							title: compiledReadme?.title ?? name,
							portNumber: 5000 + exerciseNumber,
						}
					} else {
						const stepNumber = extractStepNumber(dir)
						return {
							name,
							type: 'step-final',
							exerciseNumber,
							stepNumber,
							relativePath,
							fullPath,
							instructionsCode: compiledReadme?.code,
							title: compiledReadme?.title ?? name,
							portNumber: 5050 + exerciseNumber + stepNumber,
						}
					}
				}),
			)
		},
	)
}

export async function getExercises(): Promise<
	(ExerciseApp | StepExerciseApp)[]
> {
	const workshopRoot = await getWorkshopRoot()
	return readDir(path.join(workshopRoot, 'exercise')).then(
		(dirs): Promise<Array<ExerciseApp | StepExerciseApp>> => {
			return Promise.all(
				dirs.map(async function getAppFromPath(dir) {
					const relativePath = path.join('exercise', dir)
					const exerciseNumber = extractExerciseNumber(dir)
					const fullPath = path.join(workshopRoot, relativePath)
					const compiledReadme = await compileReadme(fullPath)
					const name = getPkgName(fullPath)
					if (dir.includes('.step-')) {
						const stepNumber = extractStepNumber(dir)
						return {
							name,
							type: 'step-exercise',
							exerciseNumber,
							stepNumber,
							relativePath,
							fullPath,
							instructionsCode: compiledReadme?.code,
							title: compiledReadme?.title ?? name,
							portNumber: 4050 + exerciseNumber + stepNumber,
						}
					} else {
						return {
							name,
							type: 'exercise',
							stepNumber: 1,
							relativePath,
							exerciseNumber,
							fullPath,
							instructionsCode: compiledReadme?.code,
							title: compiledReadme?.title ?? name,
							portNumber: 4000 + exerciseNumber,
						}
					}
				}),
			)
		},
	)
}

export async function getTopic(topicNumber: number | string) {
	const topics = await getTopics()
	return topics.find(s => s.topicNumber === Number(topicNumber))
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
