import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { globby } from 'globby'
import { getErrorMessage } from '../utils.ts'

type PackageJson = {
	name?: string
	packageManager?: string
	workspaces?: Array<string> | { packages?: Array<string> }
	dependencies?: Record<string, string>
	devDependencies?: Record<string, string>
	optionalDependencies?: Record<string, string>
}

export type RootPackageInstallStatus = {
	rootDir: string
	packageJsonPath: string
	packageManager: string | null
	dependencyHash: string | null
	dependenciesNeedInstall: boolean
	missingDependencies: Array<string>
	missingDevDependencies: Array<string>
	missingOptionalDependencies: Array<string>
	reason:
		| 'missing-node-modules'
		| 'missing-dependencies'
		| 'package-json-unreadable'
		| 'up-to-date'
}

export type WorkspaceInstallStatus = {
	roots: Array<RootPackageInstallStatus>
	dependenciesNeedInstall: boolean
	dependencyHash: string | null
}

const workspaceIgnorePatterns = [
	'**/node_modules/**',
	'**/.git/**',
	'**/.cache/**',
	'**/dist/**',
	'**/build/**',
	'**/coverage/**',
]

function hashString(value: string) {
	return createHash('sha256').update(value).digest('hex').slice(0, 8)
}

function normalizeDependencyMap(
	dependencies: Record<string, string> | undefined,
): Record<string, string> {
	const entries = Object.entries(dependencies ?? {}).sort(([a], [b]) =>
		a.localeCompare(b),
	)
	return Object.fromEntries(entries)
}

function getDependencySnapshot(packageJson: PackageJson) {
	return {
		dependencies: normalizeDependencyMap(packageJson.dependencies),
		devDependencies: normalizeDependencyMap(packageJson.devDependencies),
		optionalDependencies: normalizeDependencyMap(packageJson.optionalDependencies),
	}
}

function parsePackageManager(value: string | undefined) {
	if (!value) return null
	const [name] = value.split('@')
	return name || null
}

function normalizeWorkspacePattern(pattern: string) {
	const trimmed = pattern.trim()
	if (!trimmed) return trimmed
	const isNegated = trimmed.startsWith('!')
	const raw = isNegated ? trimmed.slice(1) : trimmed
	const normalized = raw.replace(/\\/g, '/')
	const withPackageJson = normalized.endsWith('package.json')
		? normalized
		: path.posix.join(normalized, 'package.json')
	return isNegated ? `!${withPackageJson}` : withPackageJson
}

async function readPackageJson(filePath: string): Promise<PackageJson | null> {
	try {
		const contents = await fs.readFile(filePath, 'utf8')
		return JSON.parse(contents) as PackageJson
	} catch (error) {
		console.warn(
			`⚠️  Failed to read package.json at ${filePath}:`,
			getErrorMessage(error),
		)
		return null
	}
}

async function getWorkspacePackageJsonPaths(packageJsonPath: string) {
	const packageJson = await readPackageJson(packageJsonPath)
	if (!packageJson) return []
	const workspaces = Array.isArray(packageJson.workspaces)
		? packageJson.workspaces
		: packageJson.workspaces?.packages ?? []
	if (!workspaces.length) return []

	const workspacePatterns = workspaces.map(normalizeWorkspacePattern)
	return globby(workspacePatterns, {
		cwd: path.dirname(packageJsonPath),
		absolute: true,
		ignore: workspaceIgnorePatterns,
	})
}

async function listPackageJsonPaths(cwd: string) {
	return globby('**/package.json', {
		cwd,
		absolute: true,
		ignore: workspaceIgnorePatterns,
	})
}

async function listInstalledPackages(nodeModulesPath: string) {
	try {
		const entries = await fs.readdir(nodeModulesPath, { withFileTypes: true })
		const packages = new Set<string>()

		for (const entry of entries) {
			if (entry.name.startsWith('.')) continue
			if (entry.name.startsWith('@')) {
				if (!entry.isDirectory()) continue
				const scopePath = path.join(nodeModulesPath, entry.name)
				const scopeEntries = await fs.readdir(scopePath, {
					withFileTypes: true,
				})
				for (const scopedEntry of scopeEntries) {
					if (scopedEntry.name.startsWith('.')) continue
					if (scopedEntry.isDirectory() || scopedEntry.isSymbolicLink()) {
						packages.add(`${entry.name}/${scopedEntry.name}`)
					}
				}
				continue
			}

			if (entry.isDirectory() || entry.isSymbolicLink()) {
				packages.add(entry.name)
			}
		}

		return packages
	} catch {
		return null
	}
}

function getExpectedDependencies(
	dependencies: Record<string, string> | undefined,
) {
	return Object.keys(dependencies ?? {}).sort()
}

export async function getRootPackageJsonPaths(cwd: string) {
	const allPackageJsonPaths = await listPackageJsonPaths(cwd)
	const workspacePackageJsonPaths = new Set<string>()

	for (const packageJsonPath of allPackageJsonPaths) {
		const workspacePaths = await getWorkspacePackageJsonPaths(packageJsonPath)
		for (const workspacePath of workspacePaths) {
			workspacePackageJsonPaths.add(path.resolve(workspacePath))
		}
	}

	return allPackageJsonPaths
		.map((packageJsonPath) => path.resolve(packageJsonPath))
		.filter((packageJsonPath) => !workspacePackageJsonPaths.has(packageJsonPath))
		.sort()
}

export async function getRootPackageInstallStatus(
	packageJsonPath: string,
): Promise<RootPackageInstallStatus> {
	const rootDir = path.dirname(packageJsonPath)
	const packageJson = await readPackageJson(packageJsonPath)
	if (!packageJson) {
		return {
			rootDir,
			packageJsonPath,
			packageManager: null,
			dependencyHash: null,
			dependenciesNeedInstall: false,
			missingDependencies: [],
			missingDevDependencies: [],
			missingOptionalDependencies: [],
			reason: 'package-json-unreadable',
		}
	}

	const dependencySnapshot = getDependencySnapshot(packageJson)
	const dependencyHash = hashString(JSON.stringify(dependencySnapshot))
	const packageManager = parsePackageManager(packageJson.packageManager)

	const dependencies = getExpectedDependencies(packageJson.dependencies)
	const devDependencies = getExpectedDependencies(packageJson.devDependencies)
	const optionalDependencies = getExpectedDependencies(
		packageJson.optionalDependencies,
	)
	const expectedDependencies = [
		...dependencies,
		...devDependencies,
		...optionalDependencies,
	]

	if (expectedDependencies.length === 0) {
		return {
			rootDir,
			packageJsonPath,
			packageManager,
			dependencyHash,
			dependenciesNeedInstall: false,
			missingDependencies: [],
			missingDevDependencies: [],
			missingOptionalDependencies: [],
			reason: 'up-to-date',
		}
	}

	const installedPackages = await listInstalledPackages(
		path.join(rootDir, 'node_modules'),
	)
	if (!installedPackages) {
		return {
			rootDir,
			packageJsonPath,
			packageManager,
			dependencyHash,
			dependenciesNeedInstall: true,
			missingDependencies: dependencies,
			missingDevDependencies: devDependencies,
			missingOptionalDependencies: optionalDependencies,
			reason: 'missing-node-modules',
		}
	}

	const missingDependencies = dependencies.filter(
		(dep) => !installedPackages.has(dep),
	)
	const missingDevDependencies = devDependencies.filter(
		(dep) => !installedPackages.has(dep),
	)
	const missingOptionalDependencies = optionalDependencies.filter(
		(dep) => !installedPackages.has(dep),
	)
	const dependenciesNeedInstall =
		missingDependencies.length > 0 || missingDevDependencies.length > 0

	return {
		rootDir,
		packageJsonPath,
		packageManager,
		dependencyHash,
		dependenciesNeedInstall,
		missingDependencies,
		missingDevDependencies,
		missingOptionalDependencies,
		reason: dependenciesNeedInstall ? 'missing-dependencies' : 'up-to-date',
	}
}

export async function getWorkspaceInstallStatus(
	cwd: string,
): Promise<WorkspaceInstallStatus> {
	const rootPackageJsonPaths = await getRootPackageJsonPaths(cwd)
	const rootStatuses = await Promise.all(
		rootPackageJsonPaths.map(getRootPackageInstallStatus),
	)

	const dependenciesNeedInstall = rootStatuses.some(
		(status) => status.dependenciesNeedInstall,
	)
	const dependencyHash =
		rootStatuses.length > 0
			? hashString(
					JSON.stringify(
						rootStatuses
							.map((status) => ({
								path: path.relative(cwd, status.packageJsonPath),
								hash: status.dependencyHash,
							}))
							.sort((a, b) => a.path.localeCompare(b.path)),
					),
				)
			: null

	return {
		roots: rootStatuses,
		dependenciesNeedInstall,
		dependencyHash,
	}
}

export function getInstallCommand(packageManager: string | null) {
	switch (packageManager) {
		case 'pnpm':
			return { command: 'pnpm', args: ['install'] }
		case 'yarn':
			return { command: 'yarn', args: ['install'] }
		case 'bun':
			return { command: 'bun', args: ['install'] }
		case 'npm':
		default:
			return { command: 'npm', args: ['install'] }
	}
}
