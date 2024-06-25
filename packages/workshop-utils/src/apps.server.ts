import fs from 'node:fs'
import path from 'node:path'
import { type CacheEntry } from '@epic-web/cachified'
import { remember } from '@epic-web/remember'
/// TODO: figure out why this import is necessary (without it tsc seems to not honor the boolean reset 🤷‍♂️)
import '@total-typescript/ts-reset'
import { execa } from 'execa'
import fsExtra from 'fs-extra'
import { glob } from 'glob'
import { globby, isGitIgnored } from 'globby'
import { z } from 'zod'
import {
	appsCache,
	cachified,
	exampleAppCache,
	playgroundAppCache,
	problemAppCache,
	solutionAppCache,
} from './cache.server.js'
import { getOptionalWatcher, getWatcher } from './change-tracker.server.js'
import { compileMdx } from './compile-mdx.server.js'
import {
	closeProcess,
	isAppRunning,
	runAppDev,
	waitOnApp,
} from './process-manager.server.js'
import { getServerTimeHeader, type Timings } from './timing.server.js'
import { getErrorMessage } from './utils.js'
import { getPkgProp } from './utils.server.js'

process.env.NODE_ENV ??= 'development'

const workshopRoot = getWorkshopRoot()

const playgroundAppNameInfoPath = path.join(
	getWorkshopRoot(),
	'node_modules',
	'.cache',
	'epicshop',
	'playground.json',
)

type CachifiedOptions = { timings?: Timings; request?: Request }

const BaseAppSchema = z.object({
	/** a unique identifier for the app */
	name: z.string(),
	/** the title of the app used for display (comes from the package.json title prop) */
	title: z.string(),
	/** used when displaying the list of files to match the list of apps in the file system (comes the name of the directory of the app) */
	dirName: z.string(),
	fullPath: z.string(),
	relativePath: z.string(),
	instructionsCode: z.string().optional(),
	epicVideoEmbeds: z.array(z.string()).optional(),
	test: z.union([
		z.object({
			type: z.literal('browser'),
			pathname: z.string(),
			testFiles: z.array(z.string()),
		}),
		z.object({ type: z.literal('script'), script: z.string() }),
		z.object({ type: z.literal('none') }),
	]),
	dev: z.union([
		z.object({ type: z.literal('browser'), pathname: z.string() }),
		z.object({
			type: z.literal('script'),
			portNumber: z.number(),
			initialRoute: z.string(),
		}),
		z.object({ type: z.literal('none') }),
	]),
})

const BaseExerciseStepAppSchema = BaseAppSchema.extend({
	exerciseNumber: z.number(),
	stepNumber: z.number(),
})

const ProblemAppSchema = BaseExerciseStepAppSchema.extend({
	type: z.literal('problem'),
	solutionName: z.string().nullable(),
})

const SolutionAppSchema = BaseExerciseStepAppSchema.extend({
	type: z.literal('solution'),
	problemName: z.string().nullable(),
})

const ExampleAppSchema = BaseAppSchema.extend({
	type: z.literal('example'),
})

const PlaygroundAppSchema = BaseAppSchema.extend({
	type: z.literal('playground'),
	appName: z.string(),
	isUpToDate: z.boolean(),
})

const ExerciseSchema = z.object({
	/** a unique identifier for the exercise */
	exerciseNumber: z.number(),
	/** used when displaying the list of files to match the list of apps in the file system (comes the name of the directory of the app) */
	dirName: z.string(),
	/** the title of the app used for display (comes from the first h1 in the README) */
	title: z.string(),
	instructionsCode: z.string().optional(),
	finishedCode: z.string().optional(),
	instructionsEpicVideoEmbeds: z.array(z.string()).optional(),
	finishedEpicVideoEmbeds: z.array(z.string()).optional(),
	steps: z.array(
		z.union([
			z.object({
				stepNumber: z.number(),
				problem: ProblemAppSchema,
				solution: SolutionAppSchema,
			}),
			z.object({
				stepNumber: z.number(),
				problem: ProblemAppSchema,
				solution: z.never().optional(),
			}),
			z.object({
				stepNumber: z.number(),
				problem: z.never().optional(),
				solution: SolutionAppSchema,
			}),
		]),
	),
	problems: z.array(ProblemAppSchema),
	solutions: z.array(SolutionAppSchema),
})

const ExerciseStepAppSchema = z.union([ProblemAppSchema, SolutionAppSchema])

const AppSchema = z.union([
	ExerciseStepAppSchema,
	PlaygroundAppSchema,
	ExampleAppSchema,
])

type BaseApp = z.infer<typeof BaseAppSchema>

export type BaseExerciseStepApp = z.infer<typeof BaseExerciseStepAppSchema>
export type ProblemApp = z.infer<typeof ProblemAppSchema>
export type SolutionApp = z.infer<typeof SolutionAppSchema>
export type ExampleApp = z.infer<typeof ExampleAppSchema>
export type PlaygroundApp = z.infer<typeof PlaygroundAppSchema>
export type ExerciseStepApp = z.infer<typeof ExerciseStepAppSchema>
export type App = z.infer<typeof AppSchema>

type Exercise = z.infer<typeof ExerciseSchema>

export function isApp(app: any): app is App {
	return AppSchema.safeParse(app).success
}

export function isProblemApp(app: any): app is ProblemApp {
	return ProblemAppSchema.safeParse(app).success
}

export function isSolutionApp(app: any): app is SolutionApp {
	return SolutionAppSchema.safeParse(app).success
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

function exists(file: string) {
	return fs.promises.access(file, fs.constants.F_OK).then(
		() => true,
		() => false,
	)
}

function firstToExist(...files: Array<string>) {
	return Promise.all(files.map(exists)).then(results => {
		const index = results.findIndex(Boolean)
		return index === -1 ? null : files[index]
	})
}

export const modifiedTimes = remember(
	'modified_times',
	() => new Map<string, number>(),
)

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
	getWatcher()?.on('all', handleFileChanges)
}

function getForceFresh(cacheEntry: CacheEntry | null | undefined) {
	if (!cacheEntry) return true
	const latestModifiedTime = Math.max(...Array.from(modifiedTimes.values()))
	if (!latestModifiedTime) return undefined
	return latestModifiedTime > cacheEntry.metadata.createdTime ? true : undefined
}

export function setModifiedTimesForDir(dir: string) {
	modifiedTimes.set(dir, Date.now())
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

async function compileMdxIfExists(
	filepath: string,
	{ request }: { request?: Request } = {},
) {
	filepath = filepath.replace(/\\/g, '/')
	if (await exists(filepath)) {
		const compiled = await compileMdx(filepath, { request }).catch(error => {
			console.error(`Error compiling ${filepath}:`, error)
			return null
		})
		return compiled
	}
	return null
}

function getAppDirInfo(appDir: string) {
	const regex = /^(?<stepNumber>\d+)\.(problem|solution)(\.(?<subtitle>.*))?$/
	const match = regex.exec(appDir)
	if (!match?.groups) {
		console.info(
			`Ignoring directory "${appDir}" which does not match regex "${regex}"`,
			new Error().stack,
		)
		return null
	}
	const { stepNumber: stepNumberString, subtitle } = match.groups
	const stepNumber = Number(stepNumberString)
	if (!stepNumber || !Number.isFinite(stepNumber)) {
		throw new Error(
			`Cannot identify the stepNumber for app directory "${appDir}" with regex "${regex}"`,
		)
	}

	const type = match[2] as 'problem' | 'solution'
	return { stepNumber, type, subtitle }
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
	const apps = await getApps({ request, timings })
	const exerciseDirs = await readDir(path.join(workshopRoot, 'exercises'))
	const exercises: Array<Exercise> = []
	for (const dirName of exerciseDirs) {
		const exerciseNumber = extractExerciseNumber(dirName)
		if (!exerciseNumber) continue
		const compiledReadme = await compileMdxIfExists(
			path.join(workshopRoot, 'exercises', dirName, 'README.mdx'),
			{ request },
		)
		const compiledFinished = await compileMdxIfExists(
			path.join(workshopRoot, 'exercises', dirName, 'FINISHED.mdx'),
			{ request },
		)
		const steps: Exercise['steps'] = []
		const exerciseApps = apps
			.filter(isExerciseStepApp)
			.filter(app => app.exerciseNumber === exerciseNumber)
		for (const app of exerciseApps) {
			// @ts-ignore meh 🤷‍♂️
			steps[app.stepNumber - 1] = {
				...steps[app.stepNumber - 1],
				[app.type]: app,
				stepNumber: app.stepNumber,
			}
		}
		exercises.push({
			exerciseNumber,
			dirName,
			instructionsCode: compiledReadme?.code,
			finishedCode: compiledFinished?.code,
			title: compiledReadme?.title ?? dirName,
			instructionsEpicVideoEmbeds: compiledReadme?.epicVideoEmbeds,
			finishedEpicVideoEmbeds: compiledFinished?.epicVideoEmbeds,
			steps,
			problems: apps
				.filter(isProblemApp)
				.filter(app => app.exerciseNumber === exerciseNumber),
			solutions: apps
				.filter(isSolutionApp)
				.filter(app => app.exerciseNumber === exerciseNumber),
		})
	}
	return exercises
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
		forceFresh: forceFresh ?? getForceFresh(appsCache.get(key)),
		getFreshValue: async () => {
			const playgroundApp = await getPlaygroundApp({ request, timings })
			const problemApps = await getProblemApps({ request, timings })
			const solutionApps = await getSolutionApps({ request, timings })
			const exampleApps = await getExampleApps({ request, timings })
			const sortedApps = [
				playgroundApp,
				...problemApps,
				...solutionApps,
				...exampleApps,
			]
				.filter(Boolean)
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

const AppIdInfoSchema = z.object({
	exerciseNumber: z.string(),
	stepNumber: z.string(),
	type: z.union([z.literal('problem'), z.literal('solution')]),
})

/**
 * Handles both full paths and app names
 *
 * @example
 * extractNumbersAndTypeFromAppNameOrPath('02.01.problem') // { exerciseNumber: '02', stepNumber: '01', type: 'problem' }
 * extractNumbersAndTypeFromAppNameOrPath('/path/to/exercises/02.desc/01.problem.desc') // { exerciseNumber: '02', stepNumber: '01', type: 'problem' }
 */
export function extractNumbersAndTypeFromAppNameOrPath(
	fullPathOrAppName: string,
) {
	const info: { exerciseNumber?: string; stepNumber?: string; type?: string } =
		{}
	if (fullPathOrAppName.includes(path.sep)) {
		const relativePath = fullPathOrAppName.replace(
			path.join(workshopRoot, 'exercises', path.sep),
			'',
		)
		const [exerciseNumberPart, stepNumberPart] = relativePath.split(path.sep)
		if (!exerciseNumberPart || !stepNumberPart) return null
		const exerciseNumber = exerciseNumberPart.split('.')[0]
		const stepNumber = stepNumberPart.split('.')[0]
		const type = stepNumberPart.split('.')[1]?.split('.')[0]
		info.exerciseNumber = exerciseNumber
		info.stepNumber = stepNumber
		info.type = type
	} else {
		const [exerciseNumber, stepNumber, type] = fullPathOrAppName.split('.')
		info.exerciseNumber = exerciseNumber
		info.stepNumber = stepNumber
		info.type = type
	}
	const result = AppIdInfoSchema.safeParse(info)
	if (result.success) return result.data
	return null
}

async function getProblemDirs() {
	const exercisesDir = path.join(workshopRoot, 'exercises')
	const problemDirs = (
		await glob('**/*.problem*', {
			cwd: exercisesDir,
			ignore: 'node_modules/**',
		})
	).map(p => path.join(exercisesDir, p))
	return problemDirs
}

async function getSolutionDirs() {
	const exercisesDir = path.join(workshopRoot, 'exercises')
	const solutionDirs = (
		await glob('**/*.solution*', {
			cwd: exercisesDir,
			ignore: 'node_modules/**',
		})
	).map(p => path.join(exercisesDir, p))
	return solutionDirs
}

/**
 * This is the pathname for the app in the browser
 */
function getPathname(fullPath: string) {
	const appName = getAppName(fullPath)
	return `/app/${appName}/`
}

function getAppName(fullPath: string) {
	if (/playground\/?$/.test(fullPath)) return 'playground'
	if (/examples\/.+\/?$/.test(fullPath)) {
		const restOfPath = fullPath.replace(
			`${getWorkshopRoot()}${path.sep}examples${path.sep}`,
			'',
		)
		return `example.${restOfPath.split(path.sep).join('__sep__')}`
	}
	const appIdInfo = extractNumbersAndTypeFromAppNameOrPath(fullPath)
	if (appIdInfo) {
		const { exerciseNumber, stepNumber, type } = appIdInfo
		return `${exerciseNumber}.${stepNumber}.${type}`
	} else {
		const relativePath = fullPath.replace(`${workshopRoot}${path.sep}`, '')
		return relativePath.split(path.sep).join('__sep__')
	}
}

async function getFullPathFromAppName(appName: string) {
	if (appName === 'playground') return path.join(workshopRoot, 'playground')
	if (appName.startsWith('.example')) {
		const relativePath = appName
			.replace('.example', '')
			.split('__sep__')
			.join(path.sep)
		return path.join(workshopRoot, 'examples', relativePath)
	}
	if (appName.includes('__sep__')) {
		const relativePath = appName.replaceAll('__sep__', path.sep)
		return path.join(workshopRoot, relativePath)
	}
	const [exerciseNumber, stepNumber, type] = appName.split('.')
	const appDirs =
		type === 'problem'
			? await getProblemDirs()
			: type === 'solution'
				? await getSolutionDirs()
				: []
	const dir = appDirs.find(dir => {
		const info = extractNumbersAndTypeFromAppNameOrPath(dir)
		if (!info) return false
		return (
			info.exerciseNumber === exerciseNumber && info.stepNumber === stepNumber
		)
	})
	return dir ?? appName
}

async function findSolutionDir({
	fullPath,
}: {
	fullPath: string
}): Promise<string | null> {
	const dirName = path.basename(fullPath)
	if (dirName.includes('.problem')) {
		const info = getAppDirInfo(dirName)
		if (!info) return null
		const { stepNumber } = info
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
				fullPath: await getFullPathFromAppName(appName),
			})
		}
	}
	return null
}

async function findProblemDir({
	fullPath,
}: {
	fullPath: string
}): Promise<string | null> {
	const dirName = path.basename(fullPath)
	if (dirName.includes('.solution')) {
		const info = getAppDirInfo(dirName)
		if (!info) return null
		const { stepNumber } = info
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
			return findProblemDir({ fullPath: await getFullPathFromAppName(appName) })
		}
	}
	return null
}

async function getTestInfo({
	fullPath,
}: {
	fullPath: string
}): Promise<BaseApp['test']> {
	const hasPkgJson = await exists(path.join(fullPath, 'package.json'))
	const testScript = hasPkgJson
		? await getPkgProp(fullPath, 'epicshop.scripts.test', '')
		: null

	if (testScript) {
		return { type: 'script', script: testScript }
	}

	// tests are found in the corresponding solution directory
	const testAppFullPath = (await findSolutionDir({ fullPath })) ?? fullPath

	const dirList = await fs.promises.readdir(testAppFullPath)
	const testFiles = dirList.filter(item => item.includes('.test.'))
	if (testFiles.length) {
		return {
			type: 'browser',
			pathname: `${getPathname(fullPath)}test/`,
			testFiles,
		}
	}

	return { type: 'none' }
}

async function getDevInfo({
	fullPath,
	portNumber,
}: {
	fullPath: string
	portNumber: number
}): Promise<BaseApp['dev']> {
	const hasPkgJson = await exists(path.join(fullPath, 'package.json'))
	const hasDevScript = hasPkgJson
		? Boolean(await getPkgProp(fullPath, 'scripts.dev', ''))
		: false

	if (hasDevScript) {
		const initialRoute =
			(hasPkgJson
				? await getPkgProp(fullPath, 'epicshop.initialRoute', '')
				: '') || (await getPkgProp(workshopRoot, 'epicshop.initialRoute', '/'))
		return { type: 'script', portNumber, initialRoute }
	}
	const indexFiles = (await fsExtra.readdir(fullPath)).filter((file: string) =>
		file.startsWith('index.'),
	)
	if (indexFiles.length) {
		return { type: 'browser', pathname: getPathname(fullPath) }
	} else {
		return { type: 'none' }
	}
}

export async function getPlaygroundApp({
	timings,
	request,
}: CachifiedOptions = {}): Promise<PlaygroundApp | null> {
	const playgroundDir = path.join(workshopRoot, 'playground')
	const baseAppName = await getPlaygroundAppName()
	const key = `playground-${baseAppName}`

	const baseAppFullPath = baseAppName
		? await getFullPathFromAppName(baseAppName)
		: null
	const playgroundCacheEntry = playgroundAppCache.get(key)
	const forceFreshPlaygroundDir =
		getForceFreshForDir(playgroundDir, playgroundCacheEntry) ?? false
	const forceFreshBaseApp = baseAppFullPath
		? getForceFreshForDir(baseAppFullPath, playgroundCacheEntry) ?? false
		: false
	return cachified({
		key,
		cache: playgroundAppCache,
		ttl: 1000 * 60 * 60 * 24,

		timings,
		timingKey: playgroundDir.replace(`${playgroundDir}${path.sep}`, ''),
		request,
		forceFresh: forceFreshPlaygroundDir || forceFreshBaseApp,
		getFreshValue: async () => {
			if (!(await exists(playgroundDir))) return null
			if (!baseAppName) return null

			const dirName = path.basename(playgroundDir)
			const name = getAppName(playgroundDir)
			const portNumber = 4000
			const [compiledReadme, test, dev] = await Promise.all([
				compileMdxIfExists(path.join(playgroundDir, 'README.mdx'), { request }),
				getTestInfo({ fullPath: playgroundDir }),
				getDevInfo({ fullPath: playgroundDir, portNumber }),
			])

			const appModifiedTime = await getDirModifiedTime(
				await getFullPathFromAppName(baseAppName),
			)
			const playgroundAppModifiedTime = await getDirModifiedTime(playgroundDir)

			return {
				name,
				appName: baseAppName,
				type: 'playground',
				isUpToDate: appModifiedTime <= playgroundAppModifiedTime,
				fullPath: playgroundDir,
				relativePath: playgroundDir.replace(
					`${getWorkshopRoot()}${path.sep}`,
					'',
				),
				title: compiledReadme?.title ?? name,
				epicVideoEmbeds: compiledReadme?.epicVideoEmbeds,
				dirName,
				instructionsCode: compiledReadme?.code,
				test,
				dev,
			} as const
		},
	}).catch(error => {
		console.error(error)
		return null
	})
}

async function getExampleAppFromPath(
	fullPath: string,
	index: number,
	request?: Request,
): Promise<ExampleApp> {
	const dirName = path.basename(fullPath)
	const compiledReadme = await compileMdxIfExists(
		path.join(fullPath, 'README.mdx'),
		{ request },
	)
	const name = getAppName(fullPath)
	const portNumber = 8000 + index
	return {
		name,
		type: 'example',
		fullPath,
		relativePath: fullPath.replace(`${getWorkshopRoot()}${path.sep}`, ''),
		title: compiledReadme?.title ?? name,
		epicVideoEmbeds: compiledReadme?.epicVideoEmbeds,
		dirName,
		instructionsCode: compiledReadme?.code,
		test: await getTestInfo({ fullPath }),
		dev: await getDevInfo({ fullPath, portNumber }),
	}
}

async function getExampleApps({
	timings,
	request,
}: CachifiedOptions = {}): Promise<Array<ExampleApp>> {
	const examplesDir = path.join(workshopRoot, 'examples')
	const exampleDirs = (
		await glob('*', { cwd: examplesDir, ignore: 'node_modules/**' })
	).map(p => path.join(examplesDir, p))

	const exampleApps: Array<ExampleApp> = []

	for (const exampleDir of exampleDirs) {
		const index = exampleDirs.indexOf(exampleDir)
		const key = `${exampleDir}-${index}`
		const exampleApp = await cachified({
			key,
			cache: exampleAppCache,
			ttl: 1000 * 60 * 60 * 24,

			timings,
			timingKey: exampleDir.replace(`${examplesDir}${path.sep}`, ''),
			request,
			forceFresh: getForceFreshForDir(exampleDir, exampleAppCache.get(key)),
			getFreshValue: () =>
				getExampleAppFromPath(exampleDir, index, request).catch(error => {
					console.error(error)
					return null
				}),
		})
		if (exampleApp) exampleApps.push(exampleApp)
	}

	return exampleApps
}

async function getSolutionAppFromPath(
	fullPath: string,
	request?: Request,
): Promise<SolutionApp | null> {
	const dirName = path.basename(fullPath)
	const parentDirName = path.basename(path.dirname(fullPath))
	const exerciseNumber = extractExerciseNumber(parentDirName)
	if (!exerciseNumber) return null

	const name = getAppName(fullPath)
	const info = getAppDirInfo(dirName)
	if (!info) return null
	const { stepNumber } = info
	const portNumber = 7000 + (exerciseNumber - 1) * 10 + stepNumber
	const compiledReadme = await compileMdxIfExists(
		path.join(fullPath, 'README.mdx'),
		{ request },
	)
	const problemDir = await findProblemDir({
		fullPath,
	})
	const problemName = problemDir ? getAppName(problemDir) : null
	const [test, dev] = await Promise.all([
		getTestInfo({ fullPath }),
		getDevInfo({ fullPath, portNumber }),
	])
	return {
		name,
		title: compiledReadme?.title ?? name,
		epicVideoEmbeds: compiledReadme?.epicVideoEmbeds,
		type: 'solution',
		problemName,
		exerciseNumber,
		stepNumber,
		dirName,
		fullPath,
		relativePath: fullPath.replace(`${getWorkshopRoot()}${path.sep}`, ''),
		instructionsCode: compiledReadme?.code,
		test,
		dev,
	}
}

async function getSolutionApps({
	timings,
	request,
}: CachifiedOptions = {}): Promise<Array<SolutionApp>> {
	const exercisesDir = path.join(workshopRoot, 'exercises')
	const solutionDirs = await getSolutionDirs()
	const solutionApps: Array<SolutionApp> = []

	for (const solutionDir of solutionDirs) {
		const solutionApp = await cachified({
			key: solutionDir,
			cache: solutionAppCache,
			timings,
			timingKey: solutionDir.replace(`${exercisesDir}${path.sep}`, ''),
			request,
			ttl: 1000 * 60 * 60 * 24,

			forceFresh: getForceFreshForDir(
				solutionDir,
				solutionAppCache.get(solutionDir),
			),
			getFreshValue: () =>
				getSolutionAppFromPath(solutionDir, request).catch(error => {
					console.error(error)
					return null
				}),
		})
		if (solutionApp) solutionApps.push(solutionApp)
	}

	return solutionApps
}

async function getProblemAppFromPath(
	fullPath: string,
	request?: Request,
): Promise<ProblemApp | null> {
	const dirName = path.basename(fullPath)
	const parentDirName = path.basename(path.dirname(fullPath))
	const exerciseNumber = extractExerciseNumber(parentDirName)
	if (!exerciseNumber) return null

	const name = getAppName(fullPath)
	const info = getAppDirInfo(dirName)
	if (!info) return null
	const { stepNumber } = info
	const portNumber = 6000 + (exerciseNumber - 1) * 10 + stepNumber
	const compiledReadme = await compileMdxIfExists(
		path.join(fullPath, 'README.mdx'),
		{ request },
	)
	const solutionDir = await findSolutionDir({
		fullPath,
	})
	const solutionName = solutionDir ? getAppName(solutionDir) : null
	const [test, dev] = await Promise.all([
		getTestInfo({ fullPath }),
		getDevInfo({ fullPath, portNumber }),
	])
	return {
		solutionName,
		name,
		title: compiledReadme?.title ?? name,
		epicVideoEmbeds: compiledReadme?.epicVideoEmbeds,
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
}

async function getProblemApps({
	timings,
	request,
}: CachifiedOptions = {}): Promise<Array<ProblemApp>> {
	const exercisesDir = path.join(workshopRoot, 'exercises')
	const problemDirs = await getProblemDirs()
	const problemApps: Array<ProblemApp> = []
	for (const problemDir of problemDirs) {
		const problemApp = await cachified({
			key: problemDir,
			cache: problemAppCache,
			timings,
			timingKey: problemDir.replace(`${exercisesDir}${path.sep}`, ''),
			request,
			ttl: 1000 * 60 * 60 * 24,

			forceFresh: getForceFreshForDir(
				problemDir,
				problemAppCache.get(problemDir),
			),
			getFreshValue: () =>
				getProblemAppFromPath(problemDir).catch(error => {
					console.error(error)
					return null
				}),
		})
		if (problemApp) problemApps.push(problemApp)
	}
	return problemApps
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

const ExerciseAppParamsSchema = z.object({
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
	const result = ExerciseAppParamsSchema.safeParse(params)
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

export async function getNextExerciseApp(
	app: ExerciseStepApp,
	{ request, timings }: CachifiedOptions = {},
) {
	const apps = (await getApps({ request, timings })).filter(isExerciseStepApp)
	const index = apps.findIndex(a => a.name === app.name)
	if (index === -1) {
		throw new Error(`Could not find app ${app.name}`)
	}
	const nextApp = apps[index + 1]
	return nextApp ? nextApp : null
}

export async function getPrevExerciseApp(
	app: ExerciseStepApp,
	{ request, timings }: CachifiedOptions = {},
) {
	const apps = (await getApps({ request, timings })).filter(isExerciseStepApp)

	const index = apps.findIndex(a => a.name === app.name)
	if (index === -1) {
		throw new Error(`Could not find app ${app.name}`)
	}
	const prevApp = apps[index - 1]
	return prevApp ? prevApp : null
}

export function getAppPageRoute(app: ExerciseStepApp) {
	const exerciseNumber = app.exerciseNumber.toString().padStart(2, '0')
	const stepNumber = app.stepNumber.toString().padStart(2, '0')
	return `/${exerciseNumber}/${stepNumber}/${app.type}`
}

/**
 * Given a file path, this will find the app that file path belongs to.
 */
export async function getAppFromFile(filePath: string) {
	const apps = await getApps()
	return apps.find(app => filePath.startsWith(app.fullPath))
}

export async function setPlayground(
	srcDir: string,
	{ reset }: { reset?: boolean } = {},
) {
	const isIgnored = await isGitIgnored({ cwd: srcDir })
	const workshopRoot = getWorkshopRoot()
	const destDir = path.join(workshopRoot, 'playground')
	const playgroundFiles = path.join(destDir, '**')
	getOptionalWatcher()?.unwatch(playgroundFiles)
	const playgroundApp = await getAppByName('playground')
	const playgroundWasRunning = playgroundApp
		? isAppRunning(playgroundApp)
		: false
	if (playgroundApp && reset) {
		await closeProcess(playgroundApp.name)
		await fsExtra.remove(destDir)
	}
	const setPlaygroundTimestamp = Date.now()

	// run prepare-playground script if it exists
	const preSetPlaygroundPath = await firstToExist(
		path.join(srcDir, 'epicshop', 'pre-set-playground.js'),
		path.join(workshopRoot, 'epicshop', 'pre-set-playground.js'),
	)
	if (preSetPlaygroundPath) {
		await execa('node', [preSetPlaygroundPath], {
			cwd: workshopRoot,
			stdio: 'inherit',

			env: {
				EPICSHOP_PLAYGROUND_TIMESTAMP: setPlaygroundTimestamp.toString(),
				EPICSHOP_PLAYGROUND_DEST_DIR: destDir,
				EPICSHOP_PLAYGROUND_SRC_DIR: srcDir,
				EPICSHOP_PLAYGROUND_WAS_RUNNING: playgroundWasRunning.toString(),
			} as any,
		})
	}

	const basename = path.basename(srcDir)
	// If we don't delete the destination node_modules first then copying the new
	// node_modules has issues.
	await fsExtra.remove(path.join(destDir, 'node_modules'))
	// Copy the contents of the source directory to the destination directory recursively
	await fsExtra.copy(srcDir, destDir, {
		filter: async (srcFile, destFile) => {
			if (
				srcFile.includes(`${basename}${path.sep}build`) ||
				srcFile.includes(`${basename}${path.sep}public${path.sep}build`)
			) {
				return false
			}
			if (srcFile === srcDir) return true
			// we copy node_modules even though it's .gitignored
			if (srcFile.includes('node_modules')) return true
			// make sure .env is copied whether it's .gitignored or not
			if (srcFile.endsWith('.env')) return true
			if (isIgnored(srcFile)) return false

			try {
				const isDir = (await fsExtra.stat(srcFile)).isDirectory()
				if (isDir) return true
				const destIsDir = (await fsExtra.stat(destFile)).isDirectory()
				// weird, but ok
				if (destIsDir) return true

				// it's better to check if the contents are the same before copying
				// because it avoids unnecessary writes and reduces the impact on any
				// file watchers (like the remix dev server). In practice, it's definitely
				// slower, but it's better because it doesn't cause the dev server to
				// crash as often.
				const currentContents = await fsExtra.readFile(destFile)
				const newContents = await fsExtra.readFile(srcFile)
				if (currentContents.equals(newContents)) return false

				return true
			} catch {
				// 🤷‍♂️ should probably copy it in this case
				return true
			}
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

	const playgroundIsStillRunning = playgroundApp
		? isAppRunning(playgroundApp)
		: false
	const restartPlayground = playgroundWasRunning && !playgroundIsStillRunning

	// run postSet-playground script if it exists
	const postSetPlaygroundPath = await firstToExist(
		path.join(srcDir, 'epicshop', 'post-set-playground.js'),
		path.join(workshopRoot, 'epicshop', 'post-set-playground.js'),
	)
	if (postSetPlaygroundPath) {
		await execa('node', [postSetPlaygroundPath], {
			cwd: workshopRoot,
			stdio: 'inherit',

			env: {
				EPICSHOP_PLAYGROUND_TIMESTAMP: setPlaygroundTimestamp.toString(),
				EPICSHOP_PLAYGROUND_SRC_DIR: srcDir,
				EPICSHOP_PLAYGROUND_DEST_DIR: destDir,
				EPICSHOP_PLAYGROUND_WAS_RUNNING: playgroundWasRunning.toString(),
				EPICSHOP_PLAYGROUND_IS_STILL_RUNNING:
					playgroundIsStillRunning.toString(),
				EPICSHOP_PLAYGROUND_RESTART_PLAYGROUND: restartPlayground.toString(),
			} as any,
		})
	}

	if (playgroundApp && restartPlayground) {
		await runAppDev(playgroundApp)
		await waitOnApp(playgroundApp)
	}

	getOptionalWatcher()?.add(playgroundFiles)
	modifiedTimes.set(destDir, Date.now())
}

/**
 * The playground is based on another app. This returns the app the playground
 * is based on.
 */
export async function getPlaygroundAppName() {
	if (!(await exists(playgroundAppNameInfoPath))) {
		return null
	}
	try {
		const jsonString = await fs.promises.readFile(
			playgroundAppNameInfoPath,
			'utf8',
		)

		const { appName } = JSON.parse(jsonString) as any
		if (typeof appName !== 'string') return null
		return appName
	} catch {
		return null
	}
}

async function getDirModifiedTime(dir: string): Promise<number> {
	// we can't use modifiedTimes because it only stores the modified times of
	// things the app started.

	const isIgnored = await isGitIgnored({ cwd: dir })
	const files = await fs.promises.readdir(dir, { withFileTypes: true })

	const modifiedTimes = await Promise.all(
		files.map(async file => {
			if (isIgnored(file.name)) return 0

			const filePath = path.join(dir, file.name)
			if (file.isDirectory()) {
				return getDirModifiedTime(filePath)
			} else {
				try {
					const { mtimeMs } = await fs.promises.stat(filePath)
					return mtimeMs
				} catch {
					// Handle errors (e.g., file access permissions, file has been moved or deleted)
					return 0
				}
			}
		}),
	)

	return Math.max(0, ...modifiedTimes) // Ensure there is a default of 0 if all files are ignored
}

export function getAppDisplayName(a: App, allApps: Array<App>) {
	let displayName = `${a.title} (${a.type})`
	if (isExerciseStepApp(a)) {
		const typeLabel = { problem: '💪', solution: '🏁' }[a.type]
		displayName = `${a.exerciseNumber}.${a.stepNumber} ${a.title} (${typeLabel} ${a.type})`
	} else if (isPlaygroundApp(a)) {
		const playgroundAppBasis = allApps.find(
			otherApp => a.appName === otherApp.name,
		)
		if (playgroundAppBasis) {
			const basisDisplayName = getAppDisplayName(playgroundAppBasis, allApps)
			displayName = `🛝 ${basisDisplayName}`
		} else {
			displayName = `🛝 ${a.appName}`
		}
	} else if (isExampleApp(a)) {
		displayName = `📚 ${a.title} (example)`
	}
	return displayName
}

export async function getWorkshopTitle() {
	const title = await getPkgProp<string>(workshopRoot, 'epicshop.title')
	if (!title) {
		throw new Error(
			`Workshop title not found. Make sure the root of the workshop has "epicshop" with a "title" property in the package.json. ${workshopRoot}`,
		)
	}
	return title
}

export async function getWorkshopSubtitle() {
	return await getPkgProp<string>(workshopRoot, 'epicshop.subtitle')
}

export async function getWorkshopInstructor() {
	const InstructorSchema = z
		.object({
			name: z.string().optional(),
			avatar: z.string().optional(),
			𝕏: z.string().optional(),
		})
		.optional()

	const instructor = InstructorSchema.parse(
		await getPkgProp(getWorkshopRoot(), 'epicshop.instructor'),
	)
	return instructor
}

export async function getEpicWorkshopSlug() {
	const epicWorkshopSlug = await getPkgProp<string>(
		workshopRoot,
		'epicshop.epicWorkshopSlug',
		'',
	)
	return epicWorkshopSlug || null
}

export function getWorkshopRoot() {
	return process.env.EPICSHOP_CONTEXT_CWD ?? process.cwd()
}

export async function getWorkshopInstructions({
	request,
}: { request?: Request } = {}) {
	const readmeFilepath = path.join(workshopRoot, 'exercises', 'README.mdx')
	const compiled = await compileMdx(readmeFilepath, { request }).then(
		r => ({ ...r, status: 'success' }) as const,
		e => {
			console.error(
				`There was an error compiling the workshop readme`,
				readmeFilepath,
				e,
			)
			return { status: 'error', error: getErrorMessage(e) } as const
		},
	)
	return { compiled, file: readmeFilepath, relativePath: 'exercises' } as const
}

export async function getWorkshopFinished({
	request,
}: { request?: Request } = {}) {
	const finishedFilepath = path.join(workshopRoot, 'exercises', 'FINISHED.mdx')
	const compiled = await compileMdx(finishedFilepath, { request }).then(
		r => ({ ...r, status: 'success' }) as const,
		e => {
			console.error(
				`There was an error compiling the workshop finished.mdx`,
				finishedFilepath,
				e,
			)
			return { status: 'error', error: getErrorMessage(e) } as const
		},
	)
	return {
		compiled,
		file: finishedFilepath,
		relativePath: 'exercises/finished.mdx',
	} as const
}

const exercisesPath = path.join(workshopRoot, 'exercises/')
const playgroundPath = path.join(workshopRoot, 'playground/')
export function getRelativePath(filePath: string) {
	return path
		.normalize(filePath)
		.replace(playgroundPath, `playground${path.sep}`)
		.replace(exercisesPath, '')
}
