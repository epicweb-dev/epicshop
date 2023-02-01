// Don't judge this file too harshly. It's the result of a lot of refactorings
// and I haven't had the chance to clean things up since the last one 😅

import fs from 'fs'
import path from 'path'
import cp from 'child_process'
import { typedBoolean } from './misc'
import invariant from 'tiny-invariant'
import { compileMdx } from './compile-mdx.server'

type BaseApp = {
	/** a unique identifier for the app (comes from package.json name prop) */
	name: string
	/** the title of the app used for display (comes from the README, or defaults to the name) */
	title: string
	fullPath: string
	relativePath: string
	instructionsCode?: string
	portNumber: number
}

export type ExerciseApp = BaseApp & {
	type: 'exercise'
	topicNumber: number
	stepNumber: 1
}
export type FinalApp = BaseApp & {
	type: 'final'
	topicNumber: number
	stepNumber: 1
}
export type ExampleApp = BaseApp & { type: 'example' }
export type StepExerciseApp = BaseApp & {
	type: 'step-exercise'
	topicNumber: number
	stepNumber: number
}
export type StepFinalApp = BaseApp & {
	type: 'step-final'
	topicNumber: number
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
		topics[exercise.topicNumber] = {
			...topics[exercise.topicNumber],
			exercise,
			title: exercise.title,
			topicNumber: exercise.topicNumber,
		}
	}
	for (const final of finals) {
		topics[final.topicNumber] = {
			title: final.title,
			...topics[final.topicNumber],
			final,
			topicNumber: final.topicNumber,
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
	// .sort((a, b) => {
	// 	if (a.type === 'example') {
	// 		if (b.type === 'example') return a.name.localeCompare(b.name)
	// 	}
	// 	if (a.type === 'exercise') {
	// 		if (b.type === 'exercise') {
	// 			if (a.topicNumber === b.topicNumber) {
	// 				return a.stepNumber - b.stepNumber
	// 			}
	// 		}
	// 		if (b.type === 'final') {

	// 		}
	// 	}
	// })
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
					const topicNumber = extractExerciseNumber(dir)
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
							topicNumber,
							fullPath,
							instructionsCode: compiledReadme?.code,
							title: compiledReadme?.title ?? name,
							portNumber: 5000 + topicNumber,
						}
					} else {
						const stepNumber = extractStepNumber(dir)
						return {
							name,
							type: 'step-final',
							topicNumber,
							stepNumber,
							relativePath,
							fullPath,
							instructionsCode: compiledReadme?.code,
							title: compiledReadme?.title ?? name,
							portNumber: 5050 + topicNumber + stepNumber,
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
					const topicNumber = extractExerciseNumber(dir)
					const fullPath = path.join(workshopRoot, relativePath)
					const compiledReadme = await compileReadme(fullPath)
					const name = getPkgName(fullPath)
					if (dir.includes('.step-')) {
						const stepNumber = extractStepNumber(dir)
						return {
							name,
							type: 'step-exercise',
							topicNumber,
							stepNumber,
							relativePath,
							fullPath,
							instructionsCode: compiledReadme?.code,
							title: compiledReadme?.title ?? name,
							portNumber: 4050 + topicNumber + stepNumber,
						}
					} else {
						return {
							name,
							type: 'exercise',
							stepNumber: 1,
							relativePath,
							topicNumber,
							fullPath,
							instructionsCode: compiledReadme?.code,
							title: compiledReadme?.title ?? name,
							portNumber: 4000 + topicNumber,
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

export async function requireTopicApp({
	part = 'exercise',
	topicNumber: topicNumberString,
	stepNumber: stepNumberString = '1',
}: {
	part?: string
	topicNumber?: string
	stepNumber?: string
}) {
	if ((part !== 'exercise' && part !== 'final') || !topicNumberString) {
		throw new Response('Not found', { status: 404 })
	}

	const stepNumber = Number(stepNumberString)
	const topicNumber = Number(topicNumberString)

	const isStep = stepNumber > 1

	const apps = await getApps()
	const app = apps.find(app => {
		if (part === 'exercise') {
			if (isStep) {
				if (isStepExerciseApp(app)) {
					return (
						app.topicNumber === topicNumber && app.stepNumber === stepNumber
					)
				}
			} else if (isExerciseApp(app)) {
				return app.topicNumber === topicNumber
			}
		}
		if (part === 'final') {
			if (isStep) {
				if (isStepFinalApp(app)) {
					return (
						app.topicNumber === topicNumber && app.stepNumber === stepNumber
					)
				}
			} else if (isFinalApp(app)) {
				return app.topicNumber === topicNumber
			}
		}
		return false
	})
	if (!app) {
		throw new Response('Not found', { status: 404 })
	}
	return app
}

export async function getNextApp(app: App) {}

export async function getDiff(app1: App, app2: App) {
	// generate a diff between the two apps
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
