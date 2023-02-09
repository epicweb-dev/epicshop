// Don't judge this file too harshly. It's the result of a lot of refactorings
// and I haven't had the chance to clean things up since the last one 😅

import { cachified } from 'cachified'
import cp from 'child_process'
import fs from 'fs'
import glob from 'glob'
import path from 'path'
import util from 'util'
import { z } from 'zod'
import {
	exampleAppCache,
	getAppCache,
	problemAppCache,
	solutionAppCache,
} from './cache.server'
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
	/** a unique identifier for the problem app (based on its name + step number for exercise part apps and just the name for examples) */
	id: string
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
	type: 'problem'
	exerciseNumber: number
	stepNumber: number
	testScriptName: string
	testRequiresApp: boolean
}
export type SolutionApp = BaseApp & {
	type: 'solution'
	exerciseNumber: number
	stepNumber: number
}
export type ExampleApp = BaseApp & { type: 'example' }

export type ExerciseStepApp = ProblemApp | SolutionApp

export type App = ExampleApp | ExerciseStepApp

export function isApp(app: any): app is App {
	return (
		app &&
		typeof app === 'object' &&
		typeof app.id === 'string' &&
		typeof app.name === 'string' &&
		typeof app.title === 'string' &&
		typeof app.dirName === 'string' &&
		typeof app.fullPath === 'string' &&
		typeof app.portNumber === 'number' &&
		typeof app.type === 'string'
	)
}

export function isProblemApp(app: any): app is ProblemApp {
	return isApp(app) && app.type === 'problem'
}

export function isSolutionApp(app: any): app is SolutionApp {
	return isApp(app) && app.type === 'solution'
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

export function isExampleApp(app: any): app is ExampleApp {
	return isApp(app) && app.type === 'example'
}

export function isExerciseStepApp(app: any): app is ExerciseStepApp {
	return isProblemApp(app) || isSolutionApp(app)
}

async function exists(dir: string) {
	return Boolean(await fs.promises.stat(dir).catch(() => false))
}

export async function getDirMtimeMs(dir: string) {
	const { globby } = await import('globby')
	const files = await globby('**/*', { cwd: dir, gitignore: true })
	const stats = await Promise.all(
		files.map(f => fs.promises.stat(path.join(dir, f))),
	)
	return Math.max(...stats.map(s => s.mtimeMs))
}

async function readDir(dir: string) {
	if (await exists(dir)) {
		return fs.promises.readdir(dir)
	}
	return []
}

export async function getReadmePath({
	appDir,
	stepNumber,
}: {
	appDir: string
	stepNumber?: number
}) {
	let readmeFile = 'README.md'
	if (stepNumber) {
		readmeFile = `README.${stepNumber.toString().padStart(2, '0')}.md`
		readmeFile = (await exists(path.join(appDir, readmeFile)))
			? readmeFile
			: 'README.md'
	}
	return path.join(appDir, readmeFile)
}

async function compileReadme(appDir: string, number?: number) {
	const readmeFilepath = await getReadmePath({ appDir, stepNumber: number })
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
	const apps = await cachified({
		key: 'apps',
		cache: getAppCache,
		// This entire caceh is to avoid a single request getting a fresh value
		// multiple times unnecessarily (because getApps is called many times)
		ttl: 300,
		getFreshValue: async () => {
			const [problemApps, solutionApps, exampleApps] = await Promise.all([
				getProblemApps(),
				getSolutionApps(),
				getExampleApps(),
			])
			const sortedApps = [...problemApps, ...solutionApps, ...exampleApps].sort(
				(a, b) => {
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
				},
			)
			return sortedApps
		},
	})
	return apps
}

async function getPkgProp<Value>(
	fullPath: string,
	prop: string,
	defaultValue?: Value,
): Promise<Value> {
	const pkg = JSON.parse(
		(
			await fs.promises.readFile(path.join(fullPath, 'package.json'))
		).toString(),
	)
	const propPath = prop.split('.')
	let value = pkg
	for (const p of propPath) {
		value = value[p]
		if (value === undefined) break
	}
	if (value === undefined && defaultValue === undefined) {
		throw new Error(
			`Could not find required property ${prop} in package.json of ${fullPath}`,
		)
	}
	return value ?? defaultValue
}

async function getExampleAppFromPath(
	fullPath: string,
	index: number,
): Promise<ExampleApp> {
	const dirName = path.basename(fullPath)
	const compiledReadme = await compileReadme(fullPath)
	const name = await getPkgProp(fullPath, 'name', dirName)
	return {
		id: name,
		name,
		type: 'example',
		fullPath,
		title: compiledReadme?.title ?? name,
		dirName,
		portNumber: 3500 + index,
		instructionsCode: compiledReadme?.code,
	}
}

export async function getExampleApps(): Promise<Array<ExampleApp>> {
	const workshopRoot = await getWorkshopRoot()
	const exampleDirs = await globPromise(path.join(workshopRoot, 'examples/*'))
	const exampleApps = await Promise.all(
		exampleDirs.map(async (exampleDir, index) => {
			return cachified({
				key: `${exampleDir}-${index}-${await getDirMtimeMs(exampleDir)}`,
				cache: exampleAppCache,
				ttl: 1000 * 60 * 60 * 24,
				getFreshValue: () => getExampleAppFromPath(exampleDir, index),
			})
		}),
	)
	return exampleApps.flat()
}

async function getSolutionAppFromPath(
	fullPath: string,
): Promise<Array<SolutionApp>> {
	const dirName = path.basename(fullPath)
	const parentDirName = path.basename(path.dirname(fullPath))
	const exerciseNumber = extractExerciseNumber(parentDirName)
	const name = await getPkgProp(fullPath, 'name', dirName)
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
}

export async function getSolutionApps(): Promise<Array<SolutionApp>> {
	const workshopRoot = await getWorkshopRoot()
	const solutionDirs = await globPromise(
		path.join(workshopRoot, 'exercises', '**', '*solution*'),
	)
	const solutionApps = await Promise.all(
		solutionDirs.map(async solutionDir => {
			return cachified({
				key: `${solutionDir}-${await getDirMtimeMs(solutionDir)}`,
				cache: solutionAppCache,
				ttl: 1000 * 60 * 60 * 24,
				getFreshValue: () => getSolutionAppFromPath(solutionDir),
			})
		}),
	)
	return solutionApps.flat()
}

async function getProblemAppFromPath(
	fullPath: string,
): Promise<Array<ProblemApp>> {
	const dirName = path.basename(fullPath)
	const parentDirName = path.basename(path.dirname(fullPath))
	const exerciseNumber = extractExerciseNumber(parentDirName)
	const name = await getPkgProp(fullPath, 'name', dirName)
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
			const isMultiStep = appInfo.stepNumbers.length > 1
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
				testScriptName: isMultiStep
					? `test:${stepNumber.toString().padStart(2, '0')}`
					: 'test',
				testRequiresApp: await getPkgProp(
					fullPath,
					'kcd-workshop.testRequiresApp',
					false,
				),
			}
		}),
	)
}

export async function getProblemApps(): Promise<Array<ProblemApp>> {
	const workshopRoot = await getWorkshopRoot()
	const problemDirs = await globPromise(
		path.join(workshopRoot, 'exercises', '**', '*problem*'),
	)
	const problemApps = await Promise.all(
		problemDirs.map(async problemDir => {
			return cachified({
				key: `${problemDir}-${await getDirMtimeMs(problemDir)}`,
				cache: problemAppCache,
				ttl: 1000 * 60 * 60 * 24,
				getFreshValue: () => getProblemAppFromPath(problemDir),
			})
		}),
	)
	return problemApps.flat()
}

export async function getExercise(exerciseNumber: number | string) {
	const exercises = await getExercises()
	return exercises.find(s => s.exerciseNumber === Number(exerciseNumber))
}

export async function requireExercise(exerciseNumber: number | string) {
	const exercise = await getExercise(exerciseNumber)
	if (!exercise) {
		throw new Response('Not found', { status: 404 })
	}
	return exercise
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

export async function getAppById(id: string) {
	const apps = await getApps()
	return apps.find(a => a.id === id)
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

export function getAppPageRoute(app: ExerciseStepApp) {
	const exerciseNumber = app.exerciseNumber.toString().padStart(2, '0')
	const stepNumber = app.stepNumber.toString().padStart(2, '0')
	return `/${exerciseNumber}/${stepNumber}/${app.type}`
}

export async function getWorkshopTitle() {
	const root = await getWorkshopRoot()
	const title = await getPkgProp(root, 'kcd-workshop.title')
	return title
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
