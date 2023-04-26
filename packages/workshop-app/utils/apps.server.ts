import { type CacheEntry } from 'cachified'
import fs from 'fs'
import fsExtra from 'fs-extra'
import glob from 'glob'
import path from 'path'
import util from 'util'
import { z } from 'zod'
import {
	cachified,
	exampleAppCache,
	appsCache,
	problemAppCache,
	solutionAppCache,
	playgroundAppCache,
} from './cache.server'
import { compileMdx } from './compile-mdx.server'
import { getWatcher } from './change-tracker'
import { requireCachePurgeEmitter } from './purge-require-cache.server'
import { getServerTimeHeader, type Timings } from './timing.server'

const globPromise = util.promisify(glob)

const workshopRoot = getWorkshopRoot()

const playgroundAppNameInfoPath = path.join(
	getWorkshopRoot(),
	'node_modules',
	'.cache',
	'kcdshop',
	'playground.json',
)

type Prettyify<T> = { [K in keyof T]: T[K] } & {}

type CachifiedOptions = { timings?: Timings; request?: Request }

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
	/** a unique identifier for the app (comes from the relative path of the app directory (replacing "/" with "__sep__")) */
	name: string
	/** the title of the app used for display (comes from the package.json title prop) */
	title: string
	/** used when displaying the list of files to match the list of apps in the file system (comes the name of the directory of the app) */
	dirName: string
	fullPath: string
	relativePath: string
	instructionsCode?: string
	test:
		| {
				type: 'browser'
				baseUrl: `/app/${BaseApp['name']}/test/`
				testFiles: Array<string>
		  }
		| { type: 'script'; script: string; requiresApp: boolean }
		| { type: 'none' }
	dev:
		| { type: 'browser'; baseUrl: `/app/${BaseApp['name']}/` }
		| {
				type: 'script'
				portNumber: number
				baseUrl: `http://localhost:${number}/`
		  }
}

export type BaseExerciseStepApp = BaseApp & {
	exerciseNumber: number
	stepNumber: number
}

export type ProblemApp = Prettyify<
	BaseExerciseStepApp & {
		type: 'problem'
		solutionId: string | null
	}
>

export type SolutionApp = Prettyify<
	BaseExerciseStepApp & {
		type: 'solution'
		problemId: string | null
	}
>

export type ExampleApp = BaseApp & { type: 'example' }

export type PlaygroundApp = BaseApp & {
	type: 'playground'
	/** the name of the app upon which the playground is based */
	appName: string
}

export type ExerciseStepApp = ProblemApp | SolutionApp

export type App = PlaygroundApp | ExampleApp | ExerciseStepApp

export function isApp(app: any): app is App {
	return (
		app &&
		typeof app === 'object' &&
		typeof app.id === 'string' &&
		typeof app.name === 'string' &&
		typeof app.title === 'string' &&
		typeof app.dirName === 'string' &&
		typeof app.fullPath === 'string' &&
		typeof app.test === 'object' &&
		typeof app.dev === 'object' &&
		typeof app.dev.baseUrl === 'string' &&
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

export function isPlaygroundApp(app: any): app is PlaygroundApp {
	return isApp(app) && app.type === 'playground'
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

declare global {
	var __modified_times__: Map<string, number>
}

export const modifiedTimes = (global.__modified_times__ =
	global.__modified_times__ ?? new Map<string, number>())

export function init() {
	async function handleFileChanges(
		event: string,
		filePath: string,
	): Promise<void> {
		const apps = await getApps()
		for (const app of apps) {
			if (filePath.startsWith(app.fullPath)) {
				modifiedTimes.set(app.fullPath, Date.now())
				break
			}
		}
	}
	getWatcher().on('all', handleFileChanges)
	requireCachePurgeEmitter.on('before:purge', () =>
		getWatcher().off('all', handleFileChanges),
	)
}

function getForceFresh(cacheEntry: CacheEntry | null | undefined) {
	if (!cacheEntry) return true
	const latestModifiedTime = Math.max(...Array.from(modifiedTimes.values()))
	if (!latestModifiedTime) return undefined
	return latestModifiedTime > cacheEntry.metadata.createdTime ? true : undefined
}

export function getForceFreshForDir(
	dir: string,
	cacheEntry: CacheEntry | null | undefined,
) {
	if (!path.isAbsolute(dir)) {
		throw new Error(`Trying to get force fresh for non-absolute path: ${dir}`)
	}
	if (!cacheEntry) return true
	const modifiedTime = modifiedTimes.get(dir)
	if (!modifiedTime) return undefined
	return modifiedTime > cacheEntry.metadata.createdTime ? true : undefined
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
	let readmeFile = 'README.mdx'
	if (stepNumber) {
		readmeFile = `README.${stepNumber.toString().padStart(2, '0')}.mdx`
		readmeFile = (await exists(path.join(appDir, readmeFile)))
			? readmeFile
			: 'README.mdx'
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
		throw new Error(`App directory "${appDir}" does not match regex "${regex}"`)
	}
	const { range, subtitle } = match.groups
	if (!range) {
		throw new Error(`App directory "${appDir}" does not match regex "${regex}"`)
	}

	const [start, end] = range.split('-').map(Number)
	if (!start || !Number.isFinite(start)) {
		throw new Error(`App directory "${appDir}" does not match regex "${regex}"`)
	}

	if (end && !Number.isFinite(end)) {
		throw new Error(`App directory "${appDir}" does not match regex "${regex}"`)
	}

	const stepNumbers = end
		? Array.from({ length: end - start + 1 }, (_, i) => i + start)
		: [start]
	const type = match[2] as 'problem' | 'solution'
	return { stepNumbers, type, subtitle }
}

function extractExerciseNumber(dir: string) {
	const regex = /^(?<number>\d+)\./
	const number = regex.exec(dir)?.groups?.number
	if (!number) {
		return null
	}
	return Number(number)
}

export async function getExercises({
	timings,
	request,
}: CachifiedOptions = {}): Promise<Array<Exercise>> {
	const { default: pMap } = await import('p-map')
	const apps = await getApps({ request, timings })
	const exerciseDirs = await readDir(path.join(workshopRoot, 'exercises'))
	const exercises: Array<Exercise | null> = await pMap(
		exerciseDirs,
		async dirName => {
			const exerciseNumber = extractExerciseNumber(dirName)
			if (!exerciseNumber) return null
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
		},
		{ concurrency: 1 },
	)
	return exercises.filter(typedBoolean)
}

let appCallCount = 0

export async function getApps({
	timings,
	request,
	forceFresh,
}: CachifiedOptions & { forceFresh?: boolean } = {}): Promise<Array<App>> {
	const key = 'apps'
	const apps = await cachified({
		key,
		cache: appsCache,
		timings,
		timingKey: `apps_${appCallCount++}`,
		request,
		// This entire cache is to avoid a single request getting a fresh value
		// multiple times unnecessarily (because getApps is called many times)
		ttl: 1000 * 60 * 60 * 24,
		forceFresh: forceFresh ?? getForceFresh(await appsCache.get(key)),
		getFreshValue: async () => {
			const [playgroundApp, problemApps, solutionApps, exampleApps] =
				await Promise.all([
					getPlaygroundApp({ request, timings }),
					getProblemApps({ request, timings }),
					getSolutionApps({ request, timings }),
					getExampleApps({ request, timings }),
				])
			const sortedApps = [
				playgroundApp,
				...problemApps,
				...solutionApps,
				...exampleApps,
			]
				.filter(typedBoolean)
				.sort((a, b) => {
					if (isPlaygroundApp(a)) {
						if (isPlaygroundApp(b)) return a.name.localeCompare(b.name)
						else return 1
					}
					if (isPlaygroundApp(b)) return 1

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
		fs.readFileSync(path.join(fullPath, 'package.json')).toString(),
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

export function extractNumbersFromAppName(fullPath: string) {
	const regex = /(?<exerciseNumber>\d+)([^\d]*)(?<stepNumber>\d+)/g
	const { exerciseNumber, stepNumber } = regex.exec(fullPath)?.groups ?? {}
	return { exerciseNumber, stepNumber }
}

function getAppName(fullPath: string) {
	const relativePath = fullPath.replace(`${workshopRoot}${path.sep}`, '')
	return relativePath.split(path.sep).join('__sep__')
}

function getFullPathFromAppName(appName: string) {
	const relativePath = appName.replaceAll('__sep__', path.sep)
	return path.join(workshopRoot, relativePath)
}

async function findSolutionDir({
	fullPath,
	stepNumber,
}: {
	fullPath: string
	stepNumber: number
}): Promise<string | null> {
	if (path.basename(fullPath).includes('.problem')) {
		const paddedStepNumber = stepNumber.toString().padStart(2, '0')
		const parentDir = path.dirname(fullPath)
		const siblingDirs = await fs.promises.readdir(parentDir)
		const solutionDir = siblingDirs.find(dir =>
			dir.startsWith(`${paddedStepNumber}.solution`),
		)
		if (solutionDir) {
			return path.join(parentDir, solutionDir)
		}
	} else if (fullPath.endsWith('playground')) {
		const appName = await getPlaygroundAppName()
		if (appName) {
			return findSolutionDir({
				fullPath: getFullPathFromAppName(appName),
				stepNumber,
			})
		}
	}
	return null
}

async function findProblemDir({
	fullPath,
	stepNumber,
}: {
	fullPath: string
	stepNumber: number
}): Promise<string | null> {
	if (path.basename(fullPath).includes('.solution')) {
		const paddedStepNumber = stepNumber.toString().padStart(2, '0')
		const parentDir = path.dirname(fullPath)
		const siblingDirs = await fs.promises.readdir(parentDir)
		const problemDir = siblingDirs.find(
			dir => dir.endsWith('problem') && dir.includes(paddedStepNumber),
		)
		if (problemDir) {
			return path.join(parentDir, problemDir)
		}
	} else if (fullPath.endsWith('playground')) {
		const appName = await getPlaygroundAppName()
		if (appName) {
			return findProblemDir({
				fullPath: getFullPathFromAppName(appName),
				stepNumber,
			})
		}
	}
	return null
}

async function getTestInfo({
	fullPath,
	id,
	isMultiStep = false,
	stepNumber = 1,
}: {
	fullPath: string
	id: string
	isMultiStep?: boolean
	stepNumber?: number
}): Promise<BaseApp['test']> {
	const paddedStepNumber = stepNumber.toString().padStart(2, '0')
	const testScriptName = isMultiStep ? `test:${paddedStepNumber}` : 'test'
	const hasPkgJson = await exists(path.join(fullPath, 'package.json'))
	const testScript = hasPkgJson
		? await getPkgProp(
				fullPath,
				['kcd-workshop.scripts', testScriptName].join('.'),
				'',
		  )
		: null

	if (testScript) {
		const requiresApp = hasPkgJson
			? await getPkgProp(fullPath, 'kcd-workshop.testRequiresApp', false)
			: false
		return { type: 'script', script: testScript, requiresApp }
	}

	// tests are found in the corresponding solution directory
	const solutionDir = await findSolutionDir({ fullPath, stepNumber })
	if (solutionDir) {
		fullPath = solutionDir
	}

	const dirList = await fs.promises.readdir(fullPath)
	const testFiles = dirList.filter(item => item.includes('.test.'))
	if (testFiles.length) {
		return { type: 'browser', baseUrl: `/app/${id}/test/`, testFiles }
	}

	return { type: 'none' }
}

async function getDevInfo({
	fullPath,
	portNumber,
	id,
}: {
	fullPath: string
	portNumber: number
	id: string
}): Promise<BaseApp['dev']> {
	const hasPkgJson = await exists(path.join(fullPath, 'package.json'))
	const hasDevScript = hasPkgJson
		? Boolean(await getPkgProp(fullPath, ['scripts', 'dev'].join('.'), ''))
		: false

	if (hasDevScript) {
		return {
			type: 'script',
			baseUrl: `http://localhost:${portNumber}/`,
			portNumber,
		}
	}
	return { type: 'browser', baseUrl: `/app/${id}/` }
}

async function getPlaygroundApp({
	timings,
	request,
}: CachifiedOptions = {}): Promise<PlaygroundApp | null> {
	const playgroundDir = path.join(workshopRoot, 'playground')
	const appName = await getPlaygroundAppName()
	const key = `playground-${appName}`
	return cachified({
		key,
		cache: playgroundAppCache,
		ttl: 1000 * 60 * 60 * 24,
		timings,
		timingKey: playgroundDir.replace(`${playgroundDir}${path.sep}`, ''),
		request,
		forceFresh: getForceFreshForDir(
			playgroundDir,
			await playgroundAppCache.get(key),
		),
		getFreshValue: async () => {
			if (!(await exists(playgroundDir))) return null
			if (!appName) return null

			const dirName = path.basename(playgroundDir)
			const name = getAppName(playgroundDir)
			const portNumber = 4000
			const [compiledReadme, test, dev] = await Promise.all([
				compileReadme(playgroundDir),
				getTestInfo({ fullPath: playgroundDir, id: name }),
				getDevInfo({ fullPath: playgroundDir, portNumber, id: name }),
			])
			return {
				id: name,
				name,
				appName,
				type: 'playground',
				fullPath: playgroundDir,
				relativePath: playgroundDir.replace(
					`${getWorkshopRoot()}${path.sep}`,
					'',
				),
				title: compiledReadme?.title ?? name,
				dirName,
				instructionsCode: compiledReadme?.code,
				test,
				dev,
			}
		},
	})
}

async function getExampleAppFromPath(
	fullPath: string,
	index: number,
): Promise<ExampleApp> {
	const dirName = path.basename(fullPath)
	const compiledReadme = await compileReadme(fullPath)
	const name = getAppName(fullPath)
	const portNumber = 8000 + index
	return {
		id: name,
		name,
		type: 'example',
		fullPath,
		relativePath: fullPath.replace(`${getWorkshopRoot()}${path.sep}`, ''),
		title: compiledReadme?.title ?? name,
		dirName,
		instructionsCode: compiledReadme?.code,
		test: await getTestInfo({ fullPath, id: name }),
		dev: await getDevInfo({ fullPath, portNumber, id: name }),
	}
}

async function getExampleApps({
	timings,
	request,
}: CachifiedOptions = {}): Promise<Array<ExampleApp>> {
	const { default: pMap } = await import('p-map')
	const examplesDir = path.join(workshopRoot, 'examples')
	const exampleDirs = (await globPromise('*', { cwd: examplesDir })).map(p =>
		path.join(examplesDir, p),
	)
	const exampleApps = await pMap(
		exampleDirs,
		async (exampleDir, index) => {
			const key = `${exampleDir}-${index}`
			return cachified({
				key,
				cache: exampleAppCache,
				ttl: 1000 * 60 * 60 * 24,
				timings,
				timingKey: exampleDir.replace(`${examplesDir}${path.sep}`, ''),
				request,
				forceFresh: getForceFreshForDir(
					exampleDir,
					await exampleAppCache.get(key),
				),
				getFreshValue: () => getExampleAppFromPath(exampleDir, index),
			})
		},
		{ concurrency: 1 },
	)
	return exampleApps.flat()
}

async function getSolutionAppFromPath(
	fullPath: string,
): Promise<Array<SolutionApp> | null> {
	const dirName = path.basename(fullPath)
	const parentDirName = path.basename(path.dirname(fullPath))
	const exerciseNumber = extractExerciseNumber(parentDirName)
	if (!exerciseNumber) return null

	const name = getAppName(fullPath)
	const appInfo = getAppDirInfo(dirName)
	const firstStepNumber = appInfo.stepNumbers[0]
	if (firstStepNumber === undefined) {
		throw new Error(
			`invalid solution dir name: ${dirName} (could not find first step number)`,
		)
	}
	const portNumber = 7000 + (exerciseNumber - 1) * 10 + firstStepNumber
	const compiledReadme = await compileReadme(fullPath)
	return Promise.all(
		appInfo.stepNumbers.map(async stepNumber => {
			const isMultiStep = appInfo.stepNumbers.length > 1
			const id = `${name}-${stepNumber}`
			const problemDir = await findProblemDir({
				fullPath,
				stepNumber,
			})
			const problemName = problemDir ? getAppName(problemDir) : null
			const problemId = problemName ? `${problemName}-${stepNumber}` : null
			const [test, dev] = await Promise.all([
				getTestInfo({ fullPath, isMultiStep, stepNumber, id }),
				getDevInfo({ fullPath, portNumber, id }),
			])
			return {
				id,
				name,
				title: compiledReadme?.title ?? name,
				type: 'solution',
				problemId,
				exerciseNumber,
				stepNumber,
				dirName,
				fullPath,
				relativePath: fullPath.replace(`${getWorkshopRoot()}${path.sep}`, ''),
				instructionsCode: compiledReadme?.code,
				test,
				dev,
			}
		}),
	)
}

async function getSolutionApps({
	timings,
	request,
}: CachifiedOptions = {}): Promise<Array<SolutionApp>> {
	const { default: pMap } = await import('p-map')
	const exercisesDir = path.join(workshopRoot, 'exercises')
	const solutionDirs = (
		await globPromise('**/*solution*', { cwd: exercisesDir })
	).map(p => path.join(exercisesDir, p))
	const solutionApps = await pMap(
		solutionDirs,
		async solutionDir => {
			return cachified({
				key: solutionDir,
				cache: solutionAppCache,
				timings,
				timingKey: solutionDir.replace(`${exercisesDir}${path.sep}`, ''),
				request,
				ttl: 1000 * 60 * 60 * 24,
				forceFresh: getForceFreshForDir(
					solutionDir,
					await solutionAppCache.get(solutionDir),
				),
				getFreshValue: () => getSolutionAppFromPath(solutionDir),
			})
		},
		{ concurrency: 1 },
	)
	return solutionApps.filter(typedBoolean).flat()
}

async function getProblemAppFromPath(
	fullPath: string,
): Promise<Array<ProblemApp> | null> {
	const dirName = path.basename(fullPath)
	const parentDirName = path.basename(path.dirname(fullPath))
	const exerciseNumber = extractExerciseNumber(parentDirName)
	if (!exerciseNumber) return null

	const name = getAppName(fullPath)
	const appInfo = getAppDirInfo(dirName)
	const firstStepNumber = appInfo.stepNumbers[0]
	if (firstStepNumber === undefined) {
		throw new Error(
			`invalid problem dir name: ${dirName} (could not find first step number)`,
		)
	}
	const portNumber = 6000 + (exerciseNumber - 1) * 10 + firstStepNumber
	return Promise.all(
		appInfo.stepNumbers.map(async stepNumber => {
			const compiledReadme = await compileReadme(fullPath, stepNumber)
			const isMultiStep = appInfo.stepNumbers.length > 1
			const id = `${name}-${stepNumber}`
			const solutionDir = await findSolutionDir({
				fullPath,
				stepNumber,
			})
			const solutionName = solutionDir ? getAppName(solutionDir) : null
			const solutionId = solutionName ? `${solutionName}-${stepNumber}` : null
			const [test, dev] = await Promise.all([
				getTestInfo({ fullPath, isMultiStep, stepNumber, id }),
				getDevInfo({ fullPath, portNumber, id }),
			])
			return {
				id,
				solutionId,
				name,
				title: compiledReadme?.title ?? name,
				type: 'problem',
				exerciseNumber,
				stepNumber,
				dirName,
				fullPath,
				relativePath: fullPath.replace(`${getWorkshopRoot()}${path.sep}`, ''),
				instructionsCode: compiledReadme?.code,
				test,
				dev,
			}
		}),
	)
}

async function getProblemApps({
	timings,
	request,
}: CachifiedOptions = {}): Promise<Array<ProblemApp>> {
	const { default: pMap } = await import('p-map')
	const exercisesDir = path.join(workshopRoot, 'exercises')
	const problemDirs = (
		await globPromise('**/*problem*', { cwd: exercisesDir })
	).map(p => path.join(exercisesDir, p))
	const problemApps = await pMap(
		problemDirs,
		async problemDir => {
			return cachified({
				key: problemDir,
				cache: problemAppCache,
				timings,
				timingKey: problemDir.replace(`${exercisesDir}${path.sep}`, ''),
				request,
				ttl: 1000 * 60 * 60 * 24,
				forceFresh: getForceFreshForDir(
					problemDir,
					await problemAppCache.get(problemDir),
				),
				getFreshValue: () => getProblemAppFromPath(problemDir),
			})
		},
		{ concurrency: 1 },
	)
	return problemApps.filter(typedBoolean).flat()
}

export async function getExercise(
	exerciseNumber: number | string,
	{ request, timings }: CachifiedOptions = {},
) {
	const exercises = await getExercises({ request, timings })
	return exercises.find(s => s.exerciseNumber === Number(exerciseNumber))
}

export async function requireExercise(
	exerciseNumber: number | string,
	{ request, timings }: CachifiedOptions = {},
) {
	const exercise = await getExercise(exerciseNumber, { request, timings })
	if (!exercise) {
		throw new Response('Not found', {
			status: 404,
			headers: { 'Server-Timing': getServerTimeHeader(timings) },
		})
	}
	return exercise
}

export async function requireExerciseApp(
	params: Parameters<typeof getExerciseApp>[0],
	{ request, timings }: CachifiedOptions = {},
) {
	const app = await getExerciseApp(params, { request, timings })
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

export async function getExerciseApp(
	params: {
		type?: string
		exerciseNumber?: string
		stepNumber?: string
	},
	{ request, timings }: CachifiedOptions = {},
) {
	const result = exerciseAppParams.safeParse(params)
	if (!result.success) {
		return null
	}
	const { type, exerciseNumber, stepNumber } = result.data

	const apps = (await getApps({ request, timings })).filter(isExerciseStepApp)
	const exerciseApp = apps.find(app => {
		if (isExampleApp(app)) return false
		return (
			app.exerciseNumber === exerciseNumber &&
			app.stepNumber === stepNumber &&
			app.type === type
		)
	})
	if (!exerciseApp) {
		return null
	}
	return exerciseApp
}

export async function getAppByName(
	name: string,
	{ request, timings }: CachifiedOptions = {},
) {
	const apps = await getApps({ request, timings })
	return apps.find(a => a.name === name)
}

export async function getAppById(
	id: string,
	{ request, timings }: CachifiedOptions = {},
) {
	const apps = await getApps({ request, timings })
	return apps.find(a => a.id === id)
}

export async function getNextExerciseApp(
	app: ExerciseStepApp,
	{ request, timings }: CachifiedOptions = {},
) {
	const apps = (await getApps({ request, timings })).filter(isExerciseStepApp)
	const index = apps.findIndex(a => a.id === app.id)
	if (index === -1) {
		throw new Error(`Could not find app ${app.id}`)
	}
	const nextApp = apps[index + 1]
	return nextApp ? nextApp : null
}

export async function getPrevExerciseApp(
	app: ExerciseStepApp,
	{ request, timings }: CachifiedOptions = {},
) {
	const apps = (await getApps({ request, timings })).filter(isExerciseStepApp)

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

export async function setPlayground(srcDir: string) {
	const { globby, isGitIgnored } = await import('globby')
	const isIgnored = await isGitIgnored({ cwd: srcDir })
	const destDir = path.join(getWorkshopRoot(), 'playground')
	const playgroundFiles = path.join(destDir, '**')
	getWatcher().unwatch(playgroundFiles)

	const basename = path.basename(srcDir)
	// Copy the contents of the source directory to the destination directory recursively
	await fsExtra.copy(srcDir, destDir, {
		overwrite: true,
		preserveTimestamps: true,
		filter: async file => {
			if (
				file.includes(`${basename}${path.sep}build`) ||
				file.includes(`${basename}${path.sep}public${path.sep}build`)
			) {
				return false
			}
			if (file === srcDir) return true
			// we do want to copy node_modules in this case to avoid issues with
			// dependencies that are not in the workspace node_modules
			if (file.includes('node_modules')) return true
			const shouldCopy = !isIgnored(file)
			return shouldCopy
		},
	})

	async function getFiles(dir: string) {
		// make globby friendly to windows
		const dirPath = dir.replace(/\\/g, '/')
		const files = await globby([`${dirPath}/**/*`, '!**/build/**/*'], {
			onlyFiles: false,
			dot: true,
		})
		return files.map(f => f.replace(dirPath, ''))
	}

	// Remove files from destDir that were in destDir before but are not in srcDir
	const srcFiles = await getFiles(srcDir)
	const destFiles = await getFiles(destDir)
	const filesToDelete = destFiles.filter(
		fileName => !srcFiles.includes(fileName),
	)

	for (const fileToDelete of filesToDelete) {
		await fsExtra.remove(path.join(destDir, fileToDelete))
	}

	const appName = getAppName(srcDir)
	await fsExtra.ensureDir(path.dirname(playgroundAppNameInfoPath))
	await fsExtra.writeJSON(playgroundAppNameInfoPath, { appName })

	// run fixup-playground script if it exists
	const fixupPlaygroundPath = path.join(
		destDir,
		'kcdshop',
		'fixup-playground.js',
	)
	if (await exists(fixupPlaygroundPath)) {
		const { execa } = await import('execa')
		await execa('node', [fixupPlaygroundPath], {
			cwd: destDir,
			stdio: 'inherit',
		})
	}

	getWatcher().add(playgroundFiles)
	modifiedTimes.set(destDir, Date.now())
}

export async function getPlaygroundAppName() {
	if (!(await exists(playgroundAppNameInfoPath))) {
		return null
	}
	try {
		const jsonString = await fs.promises.readFile(
			playgroundAppNameInfoPath,
			'utf8',
		)
		const { appName } = JSON.parse(jsonString)
		if (typeof appName !== 'string') return null
		return appName
	} catch {
		return null
	}
}

export async function getWorkshopTitle() {
	const title = await getPkgProp<string>(workshopRoot, 'kcd-workshop.title')
	if (!title) {
		throw new Error(
			`Workshop title not found. Make sure the root of the workshop has "kcd-workshop" and "title" in the package.json. ${workshopRoot}`,
		)
	}
	return title
}

export function getWorkshopRoot() {
	return process.env.KCDSHOP_CONTEXT_CWD ?? process.cwd()
}

export function typedBoolean<T>(
	value: T,
): value is Exclude<T, false | null | undefined | '' | 0> {
	return Boolean(value)
}

const exercisesPath = path.join(workshopRoot, 'exercises/')
const playgroundPath = path.join(workshopRoot, 'playground/')
export function getRelativePath(filePath: string) {
	return path
		.normalize(filePath)
		.replace(playgroundPath, `playground${path.sep}`)
		.replace(exercisesPath, '')
}
