import fs from 'node:fs'
import path from 'node:path'
import { type CacheEntry } from '@epic-web/cachified'
import { invariant } from '@epic-web/invariant'
import { remember } from '@epic-web/remember'
import chokidar from 'chokidar'
/// TODO: figure out why this import is necessary (without it tsc seems to not honor the boolean reset 🤷‍♂️)
import '@total-typescript/ts-reset'
import closeWithGrace from 'close-with-grace'
import { execa } from 'execa'
import fsExtra from 'fs-extra'
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
import { compileMdx } from './compile-mdx.server.js'
import {
	getAppConfig,
	getStackBlitzUrl,
	getWorkshopConfig,
} from './config.server.js'
import { getPreferences } from './db.server.js'
import { getEnv, init as initEnv } from './env.server.js'
import { getDirModifiedTime } from './modified-time.server.js'
import {
	closeProcess,
	isAppRunning,
	runAppDev,
	waitOnApp,
} from './process-manager.server.js'
import { getServerTimeHeader, time, type Timings } from './timing.server.js'
import { getErrorMessage } from './utils.js'
import { dayjs } from './utils.server.js'

declare global {
	var __epicshop_apps_initialized__: boolean | undefined
}
global.__epicshop_apps_initialized__ ??= false

export function setWorkshopRoot(
	root: string = process.env.EPICSHOP_CONTEXT_CWD ?? process.cwd(),
) {
	process.env.EPICSHOP_CONTEXT_CWD = root
}

export function getWorkshopRoot() {
	if (!process.env.EPICSHOP_CONTEXT_CWD) setWorkshopRoot()

	return process.env.EPICSHOP_CONTEXT_CWD
}

function getPlaygroundAppNameInfoPath() {
	return path.join(
		getWorkshopRoot(),
		'node_modules',
		'.cache',
		'epicshop',
		'playground.json',
	)
}

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
	stackBlitzUrl: z.string().nullable(),
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
	/** the full path to the exercise directory */
	fullPath: z.string(),
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
export type AppType = App['type']

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

async function firstToExist(...files: Array<string>) {
	const results = await Promise.all(files.map(exists))
	const index = results.findIndex(Boolean)
	return index === -1 ? null : files[index]
}

export const modifiedTimes = remember(
	'modified_times',
	() => new Map<string, number>(),
)

export async function init(workshopRoot?: string) {
	setWorkshopRoot(workshopRoot)

	if (global.__epicshop_apps_initialized__) return

	global.__epicshop_apps_initialized__ = true
	const config = getWorkshopConfig()
	process.env.EPICSHOP_GITHUB_REPO = config.githubRepo
	process.env.EPICSHOP_GITHUB_ROOT = config.githubRoot

	initEnv()

	global.ENV = getEnv()

	if (
		!ENV.EPICSHOP_DEPLOYED &&
		process.env.EPICSHOP_ENABLE_WATCHER === 'true'
	) {
		const isIgnored = await isGitIgnored({ cwd: getWorkshopRoot() })

		// watch the README, FINISHED, and package.json for changes that affect the apps
		const filesToWatch = ['README.mdx', 'FINISHED.mdx', 'package.json']
		const chok = chokidar.watch(['examples', 'playground', 'exercises'], {
			cwd: getWorkshopRoot(),
			ignoreInitial: true,
			ignored(filePath, stats) {
				if (isIgnored(filePath)) return true
				if (filePath.includes('.git')) return true

				if (stats?.isDirectory()) {
					if (filePath.endsWith('playground')) return false
					const pathParts = filePath.split(path.sep)
					if (pathParts.at(-2) === 'examples') return false

					// steps
					if (pathParts.at(-3) === 'exercises') return false

					// exercises
					if (pathParts.at(-2) === 'exercises') return false

					// the exercise dir itself
					if (pathParts.at(-1) === 'exercises') return false
					return true
				}

				return stats?.isFile()
					? !filesToWatch.some((file) => filePath.endsWith(file))
					: false
			},
		})

		chok.on('all', (_event, filePath) => {
			setModifiedTimesForAppDirs(path.join(getWorkshopRoot(), filePath))
		})

		closeWithGrace(() => chok.close())
	}
}

function getForceFresh(cacheEntry: CacheEntry | null | undefined) {
	if (!cacheEntry) return true
	const latestModifiedTime = Math.max(...Array.from(modifiedTimes.values()))
	if (!latestModifiedTime) return undefined
	return latestModifiedTime > cacheEntry.metadata.createdTime ? true : undefined
}

export function setModifiedTimesForAppDirs(...filePaths: Array<string>) {
	const now = Date.now()
	for (const filePath of filePaths) {
		const appDir = getAppPathFromFilePath(filePath)
		if (appDir) {
			modifiedTimes.set(appDir, now)
		} else {
			console.warn(`filePath ${filePath} does not match any app dir`)
		}
	}
}

export function getForceFreshForDir(
	cacheEntry: CacheEntry | null | undefined,
	...dirs: Array<string | undefined | null>
) {
	const truthyDirs = dirs.filter(Boolean)
	for (const d of truthyDirs) {
		if (!path.isAbsolute(d)) {
			throw new Error(`Trying to get force fresh for non-absolute path: ${d}`)
		}
	}
	if (!cacheEntry) return true
	const latestModifiedTime = truthyDirs.reduce((latest, dir) => {
		const modifiedTime = modifiedTimes.get(dir)
		return modifiedTime && modifiedTime > latest ? modifiedTime : latest
	}, 0)
	if (!latestModifiedTime) return undefined
	return latestModifiedTime > cacheEntry.metadata.createdTime ? true : undefined
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
		const compiled = await compileMdx(filepath, { request }).catch((error) => {
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
	const exerciseDirs = await readDir(path.join(getWorkshopRoot(), 'exercises'))
	const exercises: Array<Exercise> = []
	for (const dirName of exerciseDirs) {
		const exerciseNumber = extractExerciseNumber(dirName)
		if (!exerciseNumber) continue
		const compiledReadme = await compileMdxIfExists(
			path.join(getWorkshopRoot(), 'exercises', dirName, 'README.mdx'),
			{ request },
		)
		const compiledFinished = await compileMdxIfExists(
			path.join(getWorkshopRoot(), 'exercises', dirName, 'FINISHED.mdx'),
			{ request },
		)
		const steps: Exercise['steps'] = []
		const exerciseApps = apps
			.filter(isExerciseStepApp)
			.filter((app) => app.exerciseNumber === exerciseNumber)
		for (const app of exerciseApps) {
			// @ts-ignore meh 🤷‍♂️
			steps[app.stepNumber - 1] = {
				...steps[app.stepNumber - 1],
				[app.type]: app,
				stepNumber: app.stepNumber,
			}
		}
		const exercise = ExerciseSchema.parse({
			fullPath: path.join(getWorkshopRoot(), 'exercises', dirName),
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
				.filter((app) => app.exerciseNumber === exerciseNumber),
			solutions: apps
				.filter(isSolutionApp)
				.filter((app) => app.exerciseNumber === exerciseNumber),
		})
		exercises.push(exercise)
	}
	return exercises
}

let appCallCount = 0

export async function getApps({
	timings,
	request,
	forceFresh,
}: CachifiedOptions & { forceFresh?: boolean } = {}): Promise<Array<App>> {
	await init()

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
			const [playgroundApp, problemApps, solutionApps, exampleApps] =
				await Promise.all([
					time(() => getPlaygroundApp({ request, timings }), {
						type: 'getPlaygroundApp',
						timings,
					}),
					time(() => getProblemApps({ request, timings }), {
						type: 'getProblemApps',
						timings,
					}),
					time(() => getSolutionApps({ request, timings }), {
						type: 'getSolutionApps',
						timings,
					}),
					time(() => getExampleApps({ request, timings }), {
						type: 'getExampleApps',
						timings,
					}),
				])
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
			path.join(getWorkshopRoot(), 'exercises', path.sep),
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
	const exercisesDir = path.join(getWorkshopRoot(), 'exercises')
	const problemDirs = []
	const exerciseSubDirs = await readDir(exercisesDir)
	for (const subDir of exerciseSubDirs) {
		const fullSubDir = path.join(exercisesDir, subDir)
		// catch handles non-directories without us having to bother checking
		// whether it's a directory
		const subDirContents = await readDir(fullSubDir).catch(() => null)
		if (!subDirContents) continue
		const problemSubDirs = subDirContents
			.filter((dir) => dir.includes('.problem'))
			.map((dir) => path.join(fullSubDir, dir))
		problemDirs.push(...problemSubDirs)
	}
	return problemDirs
}

async function getSolutionDirs() {
	const exercisesDir = path.join(getWorkshopRoot(), 'exercises')
	const solutionDirs = []
	const exerciseSubDirs = await readDir(exercisesDir)
	for (const subDir of exerciseSubDirs) {
		const fullSubDir = path.join(exercisesDir, subDir)
		// catch handles non-directories without us having to bother checking
		// whether it's a directory
		const subDirContents = await readDir(fullSubDir).catch(() => null)
		if (!subDirContents) continue
		const solutionSubDirs = subDirContents
			.filter((dir) => dir.includes('.solution'))
			.map((dir) => path.join(fullSubDir, dir))
		solutionDirs.push(...solutionSubDirs)
	}
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
		const relativePath = fullPath.replace(`${getWorkshopRoot()}${path.sep}`, '')
		return relativePath.split(path.sep).join('__sep__')
	}
}

export async function getFullPathFromAppName(appName: string) {
	if (appName === 'playground')
		return path.join(getWorkshopRoot(), 'playground')
	if (appName.startsWith('.example')) {
		const relativePath = appName
			.replace('.example', '')
			.split('__sep__')
			.join(path.sep)
		return path.join(getWorkshopRoot(), 'examples', relativePath)
	}
	if (appName.includes('__sep__')) {
		const relativePath = appName.replaceAll('__sep__', path.sep)
		return path.join(getWorkshopRoot(), relativePath)
	}
	const [exerciseNumber, stepNumber, type] = appName.split('.')
	const appDirs =
		type === 'problem'
			? await getProblemDirs()
			: type === 'solution'
				? await getSolutionDirs()
				: []
	const dir = appDirs.find((dir) => {
		const info = extractNumbersAndTypeFromAppNameOrPath(dir)
		if (!info) return false
		return (
			info.exerciseNumber === exerciseNumber && info.stepNumber === stepNumber
		)
	})
	return dir ?? appName
}

export async function findSolutionDir({
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
		const solutionDir = siblingDirs.find((dir) =>
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

export async function findProblemDir({
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
			(dir) => dir.endsWith('problem') && dir.includes(paddedStepNumber),
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
	const {
		testTab: { enabled },
		scripts: { test: testScript },
	} = await getAppConfig(fullPath)
	if (enabled === false) return { type: 'none' }

	if (testScript) {
		return { type: 'script', script: testScript }
	}

	// tests are found in the corresponding solution directory
	const testAppFullPath = (await findSolutionDir({ fullPath })) ?? fullPath

	const dirList = await fs.promises.readdir(testAppFullPath)
	const testFiles = dirList.filter((item) => item.includes('.test.'))
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
	const {
		scripts: { dev: devScript },
		initialRoute,
	} = await getAppConfig(fullPath)
	const hasDevScript = Boolean(devScript)

	if (hasDevScript) {
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
	const playgroundDir = path.join(getWorkshopRoot(), 'playground')
	const baseAppName = await getPlaygroundAppName()
	const key = `playground-${baseAppName}`

	const baseAppFullPath = baseAppName
		? await getFullPathFromAppName(baseAppName)
		: null
	const playgroundCacheEntry = playgroundAppCache.get(key)
	return cachified({
		key,
		cache: playgroundAppCache,
		ttl: 1000 * 60 * 60 * 24,

		timings,
		timingKey: playgroundDir.replace(`${playgroundDir}${path.sep}`, ''),
		request,
		forceFresh: getForceFreshForDir(
			playgroundCacheEntry,
			playgroundDir,
			baseAppFullPath,
		),
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
			const type = 'playground'

			const title = compiledReadme?.title ?? name
			return {
				name,
				appName: baseAppName,
				type,
				isUpToDate: appModifiedTime <= playgroundAppModifiedTime,
				fullPath: playgroundDir,
				relativePath: playgroundDir.replace(
					`${getWorkshopRoot()}${path.sep}`,
					'',
				),
				title,
				epicVideoEmbeds: compiledReadme?.epicVideoEmbeds,
				dirName,
				instructionsCode: compiledReadme?.code,
				test,
				dev,
				stackBlitzUrl: await getStackBlitzUrl({
					fullPath: playgroundDir,
					title,
					type,
				}),
			} satisfies PlaygroundApp
		},
	}).catch((error) => {
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
	const type = 'example'
	const title = compiledReadme?.title ?? name
	return {
		name,
		type,
		fullPath,
		relativePath: fullPath.replace(`${getWorkshopRoot()}${path.sep}`, ''),
		title,
		epicVideoEmbeds: compiledReadme?.epicVideoEmbeds,
		dirName,
		instructionsCode: compiledReadme?.code,
		test: await getTestInfo({ fullPath }),
		dev: await getDevInfo({ fullPath, portNumber }),
		stackBlitzUrl: await getStackBlitzUrl({
			fullPath,
			title,
			type,
		}),
	} satisfies ExampleApp
}

async function getExampleApps({
	timings,
	request,
}: CachifiedOptions = {}): Promise<Array<ExampleApp>> {
	const examplesDir = path.join(getWorkshopRoot(), 'examples')
	const exampleDirs = (await readDir(examplesDir)).map((p) =>
		path.join(examplesDir, p),
	)

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
			forceFresh: getForceFreshForDir(exampleAppCache.get(key), exampleDir),
			getFreshValue: async () => {
				return getExampleAppFromPath(exampleDir, index, request).catch(
					(error) => {
						console.error(error)
						return null
					},
				)
			},
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
	const title = compiledReadme?.title ?? name
	return {
		name,
		title,
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
		stackBlitzUrl: await getStackBlitzUrl({
			fullPath,
			title,
			type: 'solution',
		}),
	} satisfies SolutionApp
}

async function getSolutionApps({
	timings,
	request,
}: CachifiedOptions = {}): Promise<Array<SolutionApp>> {
	const exercisesDir = path.join(getWorkshopRoot(), 'exercises')
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
				solutionAppCache.get(solutionDir),
				solutionDir,
			),
			getFreshValue: async () => {
				return getSolutionAppFromPath(solutionDir, request).catch((error) => {
					console.error(error)
					return null
				})
			},
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
	const title = compiledReadme?.title ?? name
	return {
		solutionName,
		name,
		title,
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
		stackBlitzUrl: await getStackBlitzUrl({
			fullPath,
			title,
			type: 'problem',
		}),
	} satisfies ProblemApp
}

async function getProblemApps({
	timings,
	request,
}: CachifiedOptions = {}): Promise<Array<ProblemApp>> {
	const exercisesDir = path.join(getWorkshopRoot(), 'exercises')
	const problemDirs = await getProblemDirs()
	const problemApps: Array<ProblemApp> = []
	for (const problemDir of problemDirs) {
		const solutionDir = await findSolutionDir({ fullPath: problemDir })
		const problemApp = await cachified({
			key: problemDir,
			cache: problemAppCache,
			timings,
			timingKey: problemDir.replace(`${exercisesDir}${path.sep}`, ''),
			request,
			ttl: 1000 * 60 * 60 * 24,

			forceFresh: getForceFreshForDir(
				problemAppCache.get(problemDir),
				problemDir,
				solutionDir,
			),
			getFreshValue: async () => {
				return getProblemAppFromPath(problemDir).catch((error) => {
					console.error(error)
					return null
				})
			},
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
	return exercises.find((s) => s.exerciseNumber === Number(exerciseNumber))
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
	const exerciseApp = apps.find((app) => {
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
	return apps.find((a) => a.name === name)
}

export async function getNextExerciseApp(
	app: ExerciseStepApp,
	{ request, timings }: CachifiedOptions = {},
) {
	const apps = (await getApps({ request, timings })).filter(isExerciseStepApp)
	const index = apps.findIndex((a) => a.name === app.name)
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

	const index = apps.findIndex((a) => a.name === app.name)
	if (index === -1) {
		throw new Error(`Could not find app ${app.name}`)
	}
	const prevApp = apps[index - 1]
	return prevApp ? prevApp : null
}
export function getAppPageRoute(
	app: ExerciseStepApp,
	{
		subroute,
		searchParams,
	}: { subroute?: string; searchParams?: URLSearchParams } = {},
) {
	const exerciseNumber = app.exerciseNumber.toString().padStart(2, '0')
	const stepNumber = app.stepNumber.toString().padStart(2, '0')
	const baseUrl = `/exercise/${exerciseNumber}/${stepNumber}/${app.type}`
	const subrouteUrl = subroute ? `/${subroute}` : ''

	if (searchParams) {
		// these are used on the diff tab and if we preserve them then the user will
		// be confused why the diff is never changing as they advance through the workshop.
		searchParams.delete('app1')
		searchParams.delete('app2')
	}

	const searchString = searchParams?.toString()
	return `${baseUrl}${subrouteUrl}${searchString ? `?${searchString}` : ''}`
}

/**
 * Given a file path, this will find the app that file path belongs to.
 */
export async function getAppFromFile(filePath: string) {
	const apps = await getApps()
	return apps.find((app) => filePath.startsWith(app.fullPath))
}

export async function savePlayground() {
	const playgroundApp = await getAppByName('playground')
	invariant(playgroundApp, 'app with name "playground" does not exist')

	invariant(
		isPlaygroundApp(playgroundApp),
		'app with name "playground" exists, but it is not a playground type app',
	)

	const playgroundDir = path.join(getWorkshopRoot(), 'playground')
	const savedPlaygroundsDir = path.join(getWorkshopRoot(), 'saved-playgrounds')
	await fsExtra.ensureDir(savedPlaygroundsDir)
	const now = dayjs()
	// note: the format must be filename safe
	const timestamp = now.format('YYYY.MM.DD_HH.mm.ss')
	const savedPlaygroundDirName = `${timestamp}_${playgroundApp.appName}`

	const persistedPlaygroundReadmePath = path.join(
		savedPlaygroundsDir,
		'README.md',
	)
	if (!(await exists(persistedPlaygroundReadmePath))) {
		await fsExtra.writeFile(
			persistedPlaygroundReadmePath,
			`
# Saved Playgrounds

This directory stores the playground directory each time you click "Set to
Playground." If you do not wish to do this, go to
[your preferences](http://localhost:5639/preferences) when the app is running
locally and uncheck "Enable saving playground."
			`.trim(),
		)
	}
	await fsExtra.copy(
		playgroundDir,
		path.join(savedPlaygroundsDir, savedPlaygroundDirName),
	)
}

export async function setPlayground(
	srcDir: string,
	{ reset }: { reset?: boolean } = {},
) {
	const preferences = await getPreferences()
	const playgroundApp = await getAppByName('playground')
	const playgroundDir = path.join(getWorkshopRoot(), 'playground')

	if (playgroundApp && preferences?.playground?.persist) {
		await savePlayground()
	}

	const isIgnored = await isGitIgnored({ cwd: srcDir })
	const playgroundWasRunning = playgroundApp
		? await isAppRunning(playgroundApp)
		: false
	if (playgroundApp && reset) {
		await closeProcess(playgroundApp.name)
		await fsExtra.remove(playgroundDir)
	}
	const setPlaygroundTimestamp = Date.now()

	// run prepare-playground script if it exists
	const preSetPlaygroundPath = await firstToExist(
		path.join(srcDir, 'epicshop', 'pre-set-playground.js'),
		path.join(getWorkshopRoot(), 'epicshop', 'pre-set-playground.js'),
	)
	if (preSetPlaygroundPath) {
		await execa('node', [preSetPlaygroundPath], {
			cwd: getWorkshopRoot(),
			stdio: 'inherit',

			env: {
				EPICSHOP_PLAYGROUND_TIMESTAMP: setPlaygroundTimestamp.toString(),
				EPICSHOP_PLAYGROUND_DEST_DIR: playgroundDir,
				EPICSHOP_PLAYGROUND_SRC_DIR: srcDir,
				EPICSHOP_PLAYGROUND_WAS_RUNNING: playgroundWasRunning.toString(),
			} as any,
		})
	}

	const basename = path.basename(srcDir)
	// If we don't delete the destination node_modules first then copying the new
	// node_modules has issues.
	await fsExtra.remove(path.join(playgroundDir, 'node_modules'))
	// Copy the contents of the source directory to the destination directory recursively
	await fsExtra.copy(srcDir, playgroundDir, {
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
		return files.map((f) => f.replace(dirPath, ''))
	}

	// Remove files from destDir that were in destDir before but are not in srcDir
	const srcFiles = await getFiles(srcDir)
	const destFiles = await getFiles(playgroundDir)
	const filesToDelete = destFiles.filter(
		(fileName) => !srcFiles.includes(fileName),
	)

	for (const fileToDelete of filesToDelete) {
		await fsExtra.remove(path.join(playgroundDir, fileToDelete))
	}

	const appName = getAppName(srcDir)
	await fsExtra.ensureDir(path.dirname(getPlaygroundAppNameInfoPath()))
	await fsExtra.writeJSON(getPlaygroundAppNameInfoPath(), { appName })

	const playgroundIsStillRunning = playgroundApp
		? isAppRunning(playgroundApp)
		: false
	const restartPlayground = playgroundWasRunning && !playgroundIsStillRunning

	// run postSet-playground script if it exists
	const postSetPlaygroundPath = await firstToExist(
		path.join(srcDir, 'epicshop', 'post-set-playground.js'),
		path.join(getWorkshopRoot(), 'epicshop', 'post-set-playground.js'),
	)
	if (postSetPlaygroundPath) {
		await execa('node', [postSetPlaygroundPath], {
			cwd: getWorkshopRoot(),
			stdio: 'inherit',

			env: {
				EPICSHOP_PLAYGROUND_TIMESTAMP: setPlaygroundTimestamp.toString(),
				EPICSHOP_PLAYGROUND_SRC_DIR: srcDir,
				EPICSHOP_PLAYGROUND_DEST_DIR: playgroundDir,
				EPICSHOP_PLAYGROUND_WAS_RUNNING: playgroundWasRunning.toString(),
				EPICSHOP_PLAYGROUND_IS_STILL_RUNNING:
					playgroundIsStillRunning.toString(),
				EPICSHOP_PLAYGROUND_RESTART_PLAYGROUND: restartPlayground.toString(),
			} as any,
		})
	}

	// since we are running without the watcher we need to set the modified time
	modifiedTimes.set(playgroundDir, Date.now())

	if (playgroundApp && restartPlayground) {
		await runAppDev(playgroundApp)
		await waitOnApp(playgroundApp)
	}
}

/**
 * The playground is based on another app. This returns the app the playground
 * is based on.
 */
export async function getPlaygroundAppName() {
	if (!(await exists(getPlaygroundAppNameInfoPath()))) {
		return null
	}
	try {
		const jsonString = await fs.promises.readFile(
			getPlaygroundAppNameInfoPath(),
			'utf8',
		)

		const { appName } = JSON.parse(jsonString) as any
		if (typeof appName !== 'string') return null
		return appName
	} catch {
		return null
	}
}

export function getAppDisplayName(a: App, allApps: Array<App>) {
	let displayName = `${a.title} (${a.type})`
	if (isExerciseStepApp(a)) {
		const typeLabel = { problem: '💪', solution: '🏁' }[a.type]
		displayName = `${a.exerciseNumber}.${a.stepNumber} ${a.title} (${typeLabel} ${a.type})`
	} else if (isPlaygroundApp(a)) {
		const playgroundAppBasis = allApps.find(
			(otherApp) => a.appName === otherApp.name,
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

export async function getWorkshopInstructions({
	request,
}: { request?: Request } = {}) {
	const readmeFilepath = path.join(getWorkshopRoot(), 'exercises', 'README.mdx')
	const compiled = await compileMdx(readmeFilepath, { request }).then(
		(r) => ({ ...r, status: 'success' }) as const,
		(e) => {
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
	const finishedFilepath = path.join(
		getWorkshopRoot(),
		'exercises',
		'FINISHED.mdx',
	)
	const compiled = await compileMdx(finishedFilepath, { request }).then(
		(r) => ({ ...r, status: 'success' }) as const,
		(e) => {
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

export function getRelativePath(filePath: string) {
	const exercisesPath = path.join(getWorkshopRoot(), 'exercises/')
	const playgroundPath = path.join(getWorkshopRoot(), 'playground/')

	return path
		.normalize(filePath.replace(/^("|')|("|')$/g, ''))
		.replace(playgroundPath, `playground${path.sep}`)
		.replace(exercisesPath, '')
}

/**
 * Given a file path, this will determine the path to the app that file belongs to.
 */
export function getAppPathFromFilePath(filePath: string): string | null {
	const [, withinWorkshopRootHalf] = filePath.split(getWorkshopRoot())
	if (!withinWorkshopRootHalf) {
		return null
	}

	const [part1, part2, part3] = withinWorkshopRootHalf
		.split(path.sep)
		.filter(Boolean)

	// Check if the file is in the playground
	if (part1 === 'playground') {
		return path.join(getWorkshopRoot(), 'playground')
	}

	// Check if the file is in an example
	if (part1 === 'examples' && part2) {
		return path.join(getWorkshopRoot(), 'examples', part2)
	}

	// Check if the file is in an exercise
	if (part1 === 'exercises' && part2 && part3) {
		return path.join(getWorkshopRoot(), 'exercises', part2, part3)
	}

	// If we couldn't determine the app path, return null
	return null
}
