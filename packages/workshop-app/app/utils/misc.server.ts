// Don't judge this file too harshly. It's the result of a lot of refactorings
// and I haven't had the chance to clean things up since the last one 😅

import cp from 'child_process'
import fs from 'fs'
import glob from 'glob'
import path from 'path'
import invariant from 'tiny-invariant'
import util from 'util'
import { z } from 'zod'
import { compileMdx } from './compile-mdx.server'

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
	instructionsCode?: string
}

export type ProblemApp = BaseApp & {
	/** a unique identifier for the problem app (based on its name + step number) */
	id: string
	type: 'problem'
	exerciseNumber: number
	stepNumber: number
}
export type SolutionApp = BaseApp & {
	/** a unique identifier for the solution app (based on its name + step number) */
	id: string
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

async function compileReadme(appDir: string, number?: number) {
	const readmeFile = number
		? `README.${number.toString().padStart(2, '0')}.md`
		: 'README.md'
	const readmeFilepath = path.join(appDir, readmeFile)
	if (await exists(readmeFilepath)) {
		const compiled = await compileMdx(readmeFilepath)
		return compiled
	}
	return null
}

function getAppDirInfo(appDir: string) {
	const regex = /^(?<range>(\d+-?)+)\.(problem|solution)(\.(?<subtitle>.*))?$/
	const match = regex.exec(appDir)
	if (!match || !match.groups) {
		throw new Error(`App directory ${appDir} does not match regex ${regex}`)
	}
	const { range, subtitle } = match.groups
	if (!range) {
		throw new Error(`App directory ${appDir} does not match regex ${regex}`)
	}

	const [start, end] = range.split('-').map(Number)
	if (!start || !Number.isFinite(start)) {
		throw new Error(`App directory ${appDir} does not match regex ${regex}`)
	}

	if (end && !Number.isFinite(end)) {
		throw new Error(`App directory ${appDir} does not match regex ${regex}`)
	}

	const stepNumbers = end
		? Array.from({ length: end - start + 1 }, (_, i) => i + start)
		: [start]
	const type = match[2] as 'problem' | 'solution'
	return { stepNumbers, type, subtitle }
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
						instructionsCode: compiledReadme?.code,
					}
				}),
			)
		},
	)
}

export async function getSolutionApps(): Promise<Array<SolutionApp>> {
	const workshopRoot = await getWorkshopRoot()
	const solutionDirs = await globPromise(
		path.join(workshopRoot, 'exercises', '**', '*solution*'),
	)
	const solutionApps = await Promise.all(
		solutionDirs.map(async function getAppFromPath(
			fullPath,
		): Promise<Array<SolutionApp>> {
			const dirName = path.basename(fullPath)
			const parentDirName = path.basename(path.dirname(fullPath))
			const exerciseNumber = extractExerciseNumber(parentDirName)
			const name = getPkgProp(fullPath, 'name', dirName)
			const appInfo = getAppDirInfo(dirName)
			const firstStepNumber = appInfo.stepNumbers[0]
			if (firstStepNumber === undefined) {
				throw new Error(
					`invalid solution dir name: ${dirName} (could not find first step number)`,
				)
			}
			const portNumber = 5000 + (exerciseNumber - 1) * 10 + firstStepNumber
			const compiledReadme = await compileReadme(fullPath)
			return appInfo.stepNumbers.map(stepNumber => {
				return {
					id: `${name}-${stepNumber}`,
					name,
					title: compiledReadme?.title ?? name,
					type: 'solution',
					exerciseNumber,
					stepNumber,
					portNumber,
					dirName,
					fullPath,
					instructionsCode: compiledReadme?.code,
				}
			})
		}),
	)
	return solutionApps.flat()
}

export async function getProblemApps(): Promise<Array<ProblemApp>> {
	const workshopRoot = await getWorkshopRoot()
	const problemDirs = await globPromise(
		path.join(workshopRoot, 'exercises', '**', '*problem*'),
	)
	const problemApps = await Promise.all(
		problemDirs.map(async function getAppFromPath(
			fullPath,
		): Promise<Array<ProblemApp>> {
			const dirName = path.basename(fullPath)
			const parentDirName = path.basename(path.dirname(fullPath))
			const exerciseNumber = extractExerciseNumber(parentDirName)
			const name = getPkgProp(fullPath, 'name', dirName)
			const appInfo = getAppDirInfo(dirName)
			const firstStepNumber = appInfo.stepNumbers[0]
			if (firstStepNumber === undefined) {
				throw new Error(
					`invalid problem dir name: ${dirName} (could not find first step number)`,
				)
			}
			const portNumber = 4000 + (exerciseNumber - 1) * 10 + firstStepNumber
			return Promise.all(
				appInfo.stepNumbers.map(async stepNumber => {
					const compiledReadme = await compileReadme(fullPath, stepNumber)
					return {
						id: `${name}-${stepNumber}`,
						name,
						title: compiledReadme?.title ?? name,
						type: 'problem',
						exerciseNumber,
						stepNumber,
						portNumber,
						dirName,
						fullPath,
						instructionsCode: compiledReadme?.code,
					}
				}),
			)
		}),
	)
	return problemApps.flat()
}

export async function getExercise(exerciseNumber: number | string) {
	const exercises = await getExercises()
	return exercises.find(s => s.exerciseNumber === Number(exerciseNumber))
}

export async function requireExerciseApp(
	params: Parameters<typeof getExerciseApp>[0],
) {
	const app = await getExerciseApp(params)
	if (!app) {
		throw new Response('Not found', { status: 404 })
	}
	return app
}

const exerciseAppParams = z.object({
	type: z.union([z.literal('problem'), z.literal('solution')]),
	exerciseNumber: z.coerce.number().finite(),
	stepNumber: z.coerce.number().finite(),
})

export async function getExerciseApp(params: {
	type?: string
	exerciseNumber?: string
	stepNumber?: string
}) {
	const result = exerciseAppParams.safeParse(params)
	if (!result.success) {
		return null
	}
	const { type, exerciseNumber, stepNumber } = result.data

	const apps = (await getApps()).filter(isExerciseStepApp)
	const app = apps.find(app => {
		if (isExampleApp(app)) return false
		return (
			app.exerciseNumber === exerciseNumber &&
			app.stepNumber === stepNumber &&
			app.type === type
		)
	})
	if (!app) {
		return null
	}
	return app
}

export async function getAppByName(name: string) {
	const apps = await getApps()
	return apps.find(a => a.name === name)
}

export async function getNextExerciseApp(app: ExerciseStepApp) {
	const apps = (await getApps()).filter(isExerciseStepApp)
	const index = apps.findIndex(a => a.id === app.id)
	if (index === -1) {
		throw new Error(`Could not find app ${app.id}`)
	}
	const nextApp = apps[index + 1]
	return nextApp ? nextApp : null
}

export async function getPrevExerciseApp(app: ExerciseStepApp) {
	const apps = (await getApps()).filter(isExerciseStepApp)

	const index = apps.findIndex(a => a.id === app.id)
	if (index === -1) {
		throw new Error(`Could not find app ${app.id}`)
	}
	const prevApp = apps[index - 1]
	return prevApp ? prevApp : null
}

export function getAppPateRoute(app: ExerciseStepApp) {
	const exerciseNumber = app.exerciseNumber.toString().padStart(2, '0')
	const stepNumber = app.stepNumber.toString().padStart(2, '0')
	return `/${exerciseNumber}/${stepNumber}/${app.type}`
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
