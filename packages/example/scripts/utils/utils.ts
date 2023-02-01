// Don't judge this file too harshly. It's the result of a lot of refactorings
// and I haven't had the chance to clean things up since the last one 😅

import fs from 'fs'
import path from 'path'
import cp from 'child_process'
import { matchSorter } from 'match-sorter'
import inquirer from 'inquirer'
import { getReadmeTitle } from './get-readme-title'

type BaseApp = {
	title: string
	fullPath: string
	relativePath: string
	readme: string
	portNumber: number
}

type ExerciseApp = BaseApp & {
	type: 'exercise'
	topicNumber: number
}
type FinalApp = BaseApp & { type: 'final'; topicNumber: number }
type ExampleApp = BaseApp & { type: 'example' }
type StepExerciseApp = BaseApp & {
	type: 'step-exercise'
	topicNumber: number
	stepNumber: number
}
type StepFinalApp = BaseApp & {
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

function isExerciseApp(app: App): app is ExerciseApp {
	return app.type === 'exercise'
}

function isFinalApp(app: App): app is FinalApp {
	return app.type === 'final'
}

function isStepExerciseApp(app: App): app is StepExerciseApp {
	return app.type === 'step-exercise'
}

function isStepFinalApp(app: App): app is StepFinalApp {
	return app.type === 'step-final'
}

function isExercisePartApp(app: App): app is ExercisePartApp {
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

async function readFile(file: string) {
	if (await exists(file)) {
		return fs.promises.readFile(file, 'utf8')
	}
	return ''
}

function extractStepNumber(dir: string) {
	const regex = /\.step-(?<number>\d+)/
	const number = regex.exec(dir)?.groups?.number
	if (!number) {
		throw new Error(
			`Step credit directory ${dir} does not match regex ${regex}`,
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

export async function getApps(): Promise<Array<App>> {
	const workshopRoot = await getWorkshopRoot()
	const [exerciseApps, finalApps, exampleApps] = await Promise.all([
		readDir(path.join(workshopRoot, 'exercise')).then(
			(dirs): Promise<Array<ExerciseApp | StepExerciseApp>> => {
				return Promise.all(
					dirs.map(async function getAppFromPath(dir) {
						const relativePath = path.join('exercise', dir)
						const topicNumber = extractExerciseNumber(dir)
						const fullPath = path.join(workshopRoot, relativePath)
						const readme = await readFile(path.join(fullPath, 'README.md'))
						const title = await getReadmeTitle(readme)
						if (dir.includes('.step-')) {
							const stepNumber = extractStepNumber(dir)
							return {
								type: 'step-exercise',
								topicNumber,
								stepNumber,
								relativePath,
								fullPath,
								readme,
								title,
								portNumber: 4050 + topicNumber + stepNumber,
							}
						} else {
							return {
								type: 'exercise',
								relativePath,
								topicNumber,
								fullPath,
								readme,
								title,
								portNumber: 4000 + topicNumber,
							}
						}
					}),
				)
			},
		),
		readDir(path.join(workshopRoot, 'final')).then(
			(dirs): Promise<Array<FinalApp | StepFinalApp>> => {
				return Promise.all(
					dirs.map(async function getAppFromPath(dir) {
						const relativePath = path.join('final', dir)
						const topicNumber = extractExerciseNumber(dir)
						const fullPath = path.join(workshopRoot, relativePath)
						const readme = await readFile(path.join(fullPath, 'README.md'))
						const title = await getReadmeTitle(readme)
						if (dir.includes('.step-')) {
							const stepNumber = extractStepNumber(dir)
							return {
								type: 'step-final',
								topicNumber,
								stepNumber,
								relativePath,
								fullPath,
								readme,
								title,
								portNumber: 5050 + topicNumber + stepNumber,
							}
						} else {
							const fullPath = path.join(workshopRoot, relativePath)
							return {
								type: 'final',
								relativePath,
								topicNumber,
								fullPath,
								readme,
								title,
								portNumber: 5000 + topicNumber,
							}
						}
					}),
				)
			},
		),
		readDir(path.join(workshopRoot, 'example')).then(
			(dirs): Promise<Array<ExampleApp>> => {
				return Promise.all(
					dirs.map(async function getAppFromPath(dir, index) {
						const relativePath = path.join('example', dir)
						const fullPath = path.join(workshopRoot, relativePath)
						const readme = await readFile(path.join(fullPath, 'README.md'))
						const title = await getReadmeTitle(readme)
						return {
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
		),
	])
	return [...exerciseApps, ...finalApps, ...exampleApps]
}

export async function getWorkshopRoot() {
	const { root: rootDir } = path.parse(process.cwd())
	let repoRoot = __dirname
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

export async function findApp(search: string): Promise<App | undefined> {
	const apps = await getApps()
	if (search.startsWith('./')) {
		search = search.slice(2)
	}

	return matchSorter(apps, search, {
		keys: ['relativePath'],
	})?.[0]
}

export async function searchApps(search: string): Promise<Array<App>> {
	const apps = await getApps()
	if (search.startsWith('./')) {
		search = search.slice(2)
	}

	return matchSorter(apps, search, {
		keys: ['relativePath', 'title'],
	})
}

export async function promptForApp(defaultApp?: string) {
	const apps = await getApps()
	const { selection } = await inquirer.prompt([
		{
			type: 'list',
			choices: apps.map(a => a.relativePath),
			name: 'selection',
			message: 'Which app do you want to start?',
			default: defaultApp ?? apps[0].relativePath,
		},
	])
	const selectedApp = apps.find(a => a.relativePath === selection)
	if (!selectedApp) {
		throw new Error(
			`Could not find an app with your selection of "${selection}". Sorry!`,
		)
	}
	return selectedApp
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

export async function guessNextApp(app: App) {
	const apps = (await getApps()).filter(isExercisePartApp)

	if (app.type === 'exercise' || app.type === 'step-exercise') {
		const finalVersion = apps.find(
			a => a.relativePath === app.relativePath.replace('exercise', 'final'),
		)
		if (finalVersion) return finalVersion
	}

	if (app.type === 'step-final') {
		const nextStep = apps
			.filter(isStepFinalApp)
			.find(a => a.stepNumber === app.stepNumber + 1)
		if (nextStep) return nextStep
	}

	if (app.type === 'final' || app.type === 'step-final') {
		const nextExercise = apps
			.filter(isExerciseApp)
			.find(a => a.topicNumber === app.topicNumber + 1)
		if (nextExercise) return nextExercise
	}

	const indexOfApp = apps.findIndex(a => a.relativePath === app.relativePath)
	const nextIndexApp = apps[indexOfApp + 1]

	if (nextIndexApp) return nextIndexApp

	return apps[0]
}

type UtilsDb = { lastDevvedApp?: string; lastDiffedApp?: string }
const dbPath = path.join(__dirname, '../db.json')

export async function saveDb(updates: Partial<UtilsDb>) {
	const db = await readDb()
	await fs.promises.writeFile(dbPath, JSON.stringify({ ...db, ...updates }))
}

export async function readDb(): Promise<UtilsDb> {
	try {
		const dbString = (await readFile(dbPath)) || '{}'
		return JSON.parse(dbString)
	} catch (error) {
		console.error(error)
		console.error(`Recovering...`)
		await fs.promises.writeFile(dbPath, JSON.stringify({}))
		return {}
	}
}
