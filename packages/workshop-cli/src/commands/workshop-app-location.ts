import { execSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

type ReadTextFile = (filePath: string) => Promise<string>
type AccessPath = (filePath: string) => Promise<void>
type ResolveImport = (specifier: string) => string
type RunCommand = (command: string) => string

type PackageJson = {
	name?: string
	epicshop?: unknown
	scripts?: Record<string, string | undefined>
}

type WorkshopContext = {
	workshopRoot: string
	localCliPrefix?: string
	localCliDir?: string
	localCliDirExists: boolean
}

export type WorkshopAppResolutionAttempt = {
	label: string
	detail: string
}

export type WorkshopAppResolution = {
	appDir: string | null
	attempts: Array<WorkshopAppResolutionAttempt>
	workshopContext: WorkshopContext | null
}

type ResolutionDeps = {
	env?: Partial<NodeJS.ProcessEnv>
	cwd?: () => string
	homedir?: () => string
	readTextFile?: ReadTextFile
	accessPath?: AccessPath
	resolveImport?: ResolveImport
	runCommand?: RunCommand
}

export async function resolveWorkshopAppLocation(
	options: { appLocation?: string } = {},
	deps: ResolutionDeps = {},
): Promise<WorkshopAppResolution> {
	const attempts: Array<WorkshopAppResolutionAttempt> = []
	const env = deps.env ?? process.env
	const readTextFile =
		deps.readTextFile ??
		(async (filePath: string) => fs.promises.readFile(filePath, 'utf8'))
	const accessPath =
		deps.accessPath ??
		(async (filePath: string) => fs.promises.access(filePath))
	const resolveImport =
		deps.resolveImport ??
		((specifier: string) => import.meta.resolve(specifier))
	const runCommand =
		deps.runCommand ??
		((command: string) => execSync(command, { encoding: 'utf-8' }).trim())
	const cwd = deps.cwd ?? (() => process.cwd())
	const homedir = deps.homedir ?? (() => os.homedir())

	const workshopContext = await findWorkshopContext(cwd(), {
		readTextFile,
		accessPath,
	})

	const envLocation = env.EPICSHOP_APP_LOCATION?.trim()
	if (envLocation) {
		const envDir = path.resolve(envLocation)
		const envAttempt = await inspectWorkshopAppDir(
			envDir,
			'EPICSHOP_APP_LOCATION',
			{ readTextFile, accessPath },
		)
		attempts.push(envAttempt.attempt)
		if (envAttempt.appDir) {
			return { appDir: envAttempt.appDir, attempts, workshopContext }
		}
	} else {
		attempts.push({
			label: 'EPICSHOP_APP_LOCATION',
			detail: 'not set',
		})
	}

	const flagLocation = options.appLocation?.trim()
	if (flagLocation) {
		const flagDir = path.resolve(flagLocation)
		const flagAttempt = await inspectWorkshopAppDir(flagDir, '--app-location', {
			readTextFile,
			accessPath,
		})
		attempts.push(flagAttempt.attempt)
		if (flagAttempt.appDir) {
			return { appDir: flagAttempt.appDir, attempts, workshopContext }
		}
	} else {
		attempts.push({
			label: '--app-location',
			detail: 'not provided',
		})
	}

	try {
		const packagePath = toFilePath(
			resolveImport('@epic-web/workshop-app/package.json'),
		)
		const resolvedAttempt = await inspectWorkshopAppDir(
			path.dirname(packagePath),
			'local package resolution',
			{ readTextFile, accessPath },
		)
		attempts.push(resolvedAttempt.attempt)
		if (resolvedAttempt.appDir) {
			return { appDir: resolvedAttempt.appDir, attempts, workshopContext }
		}
	} catch (error) {
		attempts.push({
			label: 'local package resolution',
			detail: `could not resolve @epic-web/workshop-app/package.json (${formatError(
				error,
			)})`,
		})
	}

	const globalResult = await findGlobalWorkshopApp({
		homedir,
		readTextFile,
		accessPath,
		runCommand,
	})
	attempts.push(...globalResult.attempts)
	if (globalResult.appDir) {
		return { appDir: globalResult.appDir, attempts, workshopContext }
	}

	try {
		const cliPkgPath = toFilePath(resolveImport('epicshop/package.json'))
		const cliPkgDir = path.dirname(cliPkgPath)
		const relativePath = path.resolve(cliPkgDir, '..', '..', 'workshop-app')
		const fallbackAttempt = await inspectWorkshopAppDir(
			relativePath,
			'monorepo fallback',
			{ readTextFile, accessPath },
		)
		attempts.push(fallbackAttempt.attempt)
		if (fallbackAttempt.appDir) {
			return { appDir: fallbackAttempt.appDir, attempts, workshopContext }
		}
	} catch (error) {
		attempts.push({
			label: 'monorepo fallback',
			detail: `could not resolve epicshop/package.json (${formatError(error)})`,
		})
	}

	return { appDir: null, attempts, workshopContext }
}

export function buildWorkshopAppNotFoundMessage(
	resolution: WorkshopAppResolution,
): string {
	const lines = [
		'Could not find `@epic-web/workshop-app`, so `epicshop start` does not know which app to launch.',
	]

	if (resolution.workshopContext) {
		const { workshopRoot, localCliPrefix, localCliDir, localCliDirExists } =
			resolution.workshopContext
		lines.push('', `This looks like a workshop repository: ${workshopRoot}`)

		if (localCliPrefix && localCliDir) {
			lines.push(
				localCliDirExists
					? `Its start script uses a local epicshop install at \`${localCliPrefix}\` (${localCliDir}), but that install could not resolve the workshop app package.`
					: `Its start script points at a local epicshop install \`${localCliPrefix}\` (${localCliDir}), but that directory does not exist.`,
			)
		} else {
			lines.push(
				'That usually means the workshop dependencies in this repository have not been installed yet.',
			)
		}
	}

	lines.push('', 'Lookups attempted:')
	for (const attempt of resolution.attempts) {
		lines.push(`- ${attempt.label}: ${attempt.detail}`)
	}

	lines.push('', 'Try this:')
	if (resolution.workshopContext) {
		const { workshopRoot, localCliPrefix } = resolution.workshopContext
		lines.push(`1. Run \`npm install\` in the workshop root: ${workshopRoot}`)
		if (localCliPrefix) {
			lines.push(
				`2. If that still fails, remove and reinstall the local epicshop directory at \`${localCliPrefix}\`.`,
			)
		} else {
			lines.push(
				'2. If that still fails, reinstall the workshop dependencies from the workshop root.',
			)
		}
		lines.push(
			'3. If you keep `@epic-web/workshop-app` in a separate checkout, point to it with `--app-location` or `EPICSHOP_APP_LOCATION`.',
		)
	} else {
		lines.push(
			'1. Install `@epic-web/workshop-app` where this `epicshop` CLI can resolve it.',
		)
		lines.push(
			'2. Or point to an existing checkout with `--app-location` or `EPICSHOP_APP_LOCATION`.',
		)
		lines.push(
			'3. For a global install, run `npm install -g @epic-web/workshop-app`.',
		)
	}

	return lines.join('\n')
}

async function findWorkshopContext(
	startDir: string,
	deps: { readTextFile: ReadTextFile; accessPath: AccessPath },
): Promise<WorkshopContext | null> {
	let currentDir = path.resolve(startDir)
	const root = path.parse(currentDir).root

	while (true) {
		const packageJsonPath = path.join(currentDir, 'package.json')
		const packageJson = await readPackageJson(
			packageJsonPath,
			deps.readTextFile,
		)
		if (packageJson?.epicshop) {
			const localCliPrefix = getLocalCliPrefix(packageJson)
			const localCliDir = localCliPrefix
				? path.resolve(currentDir, localCliPrefix)
				: undefined

			return {
				workshopRoot: currentDir,
				localCliPrefix,
				localCliDir,
				localCliDirExists: localCliDir
					? await pathExists(
							path.join(localCliDir, 'package.json'),
							deps.accessPath,
						)
					: false,
			}
		}

		if (currentDir === root) {
			return null
		}
		currentDir = path.dirname(currentDir)
	}
}

function getLocalCliPrefix(packageJson: PackageJson): string | undefined {
	const candidateScripts = [
		packageJson.scripts?.start,
		packageJson.scripts?.dev,
	]
	for (const script of candidateScripts) {
		if (!script) continue
		const match = script.match(/--prefix\s+(?:"([^"]+)"|'([^']+)'|([^\s]+))/)
		const value = match?.[1] ?? match?.[2] ?? match?.[3]
		if (value) {
			return value
		}
	}
	return undefined
}

async function inspectWorkshopAppDir(
	appDir: string,
	label: string,
	deps: { readTextFile: ReadTextFile; accessPath: AccessPath },
): Promise<{ appDir: string | null; attempt: WorkshopAppResolutionAttempt }> {
	const packageJsonPath = path.join(appDir, 'package.json')
	try {
		await deps.accessPath(packageJsonPath)
	} catch (error) {
		return {
			appDir: null,
			attempt: {
				label,
				detail: `checked ${packageJsonPath}, but it was not readable (${formatError(
					error,
				)})`,
			},
		}
	}

	const packageJson = await readPackageJson(packageJsonPath, deps.readTextFile)
	if (!packageJson) {
		return {
			appDir: null,
			attempt: {
				label,
				detail: `found ${packageJsonPath}, but it could not be parsed as JSON`,
			},
		}
	}

	if (packageJson.name !== '@epic-web/workshop-app') {
		const packageName = packageJson.name
			? `\`${packageJson.name}\``
			: 'an unnamed package'
		return {
			appDir: null,
			attempt: {
				label,
				detail: `checked ${packageJsonPath}, but it contains ${packageName} instead of \`@epic-web/workshop-app\``,
			},
		}
	}

	return {
		appDir,
		attempt: {
			label,
			detail: `resolved to ${appDir}`,
		},
	}
}

async function findGlobalWorkshopApp(deps: {
	homedir: () => string
	readTextFile: ReadTextFile
	accessPath: AccessPath
	runCommand: RunCommand
}): Promise<WorkshopAppResolution> {
	const attempts: Array<WorkshopAppResolutionAttempt> = []

	try {
		const npmRoot = deps.runCommand('npm root -g')
		const globalAppPath = path.join(npmRoot, '@epic-web/workshop-app')
		const npmRootAttempt = await inspectWorkshopAppDir(
			globalAppPath,
			'global npm install',
			{
				readTextFile: deps.readTextFile,
				accessPath: deps.accessPath,
			},
		)
		attempts.push(npmRootAttempt.attempt)
		if (npmRootAttempt.appDir) {
			return { appDir: npmRootAttempt.appDir, attempts, workshopContext: null }
		}
	} catch (error) {
		attempts.push({
			label: 'global npm install',
			detail: `failed to run \`npm root -g\` (${formatError(error)})`,
		})
	}

	const commonGlobalPaths = [
		path.join(
			deps.homedir(),
			'.npm-global/lib/node_modules/@epic-web/workshop-app',
		),
		path.join(
			deps.homedir(),
			'.npm-packages/lib/node_modules/@epic-web/workshop-app',
		),
		'/usr/local/lib/node_modules/@epic-web/workshop-app',
		'/usr/lib/node_modules/@epic-web/workshop-app',
	]

	for (const globalPath of commonGlobalPaths) {
		const globalAttempt = await inspectWorkshopAppDir(
			globalPath,
			'common global install paths',
			{
				readTextFile: deps.readTextFile,
				accessPath: deps.accessPath,
			},
		)
		if (globalAttempt.appDir) {
			attempts.push(globalAttempt.attempt)
			return { appDir: globalAttempt.appDir, attempts, workshopContext: null }
		}
	}

	attempts.push({
		label: 'common global install paths',
		detail: `did not find the package in: ${commonGlobalPaths.join(', ')}`,
	})

	return { appDir: null, attempts, workshopContext: null }
}

async function readPackageJson(
	packageJsonPath: string,
	readTextFile: ReadTextFile,
): Promise<PackageJson | null> {
	try {
		return JSON.parse(await readTextFile(packageJsonPath)) as PackageJson
	} catch {
		return null
	}
}

async function pathExists(
	filePath: string,
	accessPath: AccessPath,
): Promise<boolean> {
	try {
		await accessPath(filePath)
		return true
	} catch {
		return false
	}
}

function toFilePath(resolvedPath: string): string {
	return resolvedPath.startsWith('file:')
		? fileURLToPath(resolvedPath)
		: resolvedPath
}

function formatError(error: unknown): string {
	if (error instanceof Error && error.message) {
		return error.message
	}
	return String(error)
}
