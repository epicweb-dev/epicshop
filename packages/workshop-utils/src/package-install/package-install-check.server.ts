import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { execa } from 'execa'
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

type NpmLsDependency = {
	invalid?: boolean
	missing?: boolean
}

type NpmLsOutput = {
	dependencies?: Record<string, NpmLsDependency>
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
	reason: 'missing-dependencies' | 'package-json-unreadable' | 'up-to-date'
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
		optionalDependencies: normalizeDependencyMap(
			packageJson.optionalDependencies,
		),
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
		: (packageJson.workspaces?.packages ?? [])
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

function parseNpmLsOutput(raw: string): NpmLsOutput | null {
	const trimmed = raw.trim()
	if (!trimmed) return null
	try {
		return JSON.parse(trimmed) as NpmLsOutput
	} catch {
		return null
	}
}

function getFailingDependencies(
	expectedDependencies: Array<string>,
	output: NpmLsOutput | null,
) {
	if (!output?.dependencies) return expectedDependencies
	return expectedDependencies.filter((dependency) => {
		const entry = output.dependencies?.[dependency]
		if (!entry) return true
		return Boolean(entry.missing || entry.invalid)
	})
}

async function checkDependenciesWithNpmLs(
	rootDir: string,
	expectedDependencies: Array<string>,
	packageManager: string | null,
) {
	if (expectedDependencies.length === 0) {
		return { ok: true, failingDependencies: [] as Array<string> }
	}

	// Use the detected package manager, defaulting to npm
	// pnpm has compatible ls output format
	const command = packageManager === 'pnpm' ? 'pnpm' : 'npm'

	try {
		const result = await execa(
			command,
			['ls', '--depth=0', '--json', ...expectedDependencies],
			{ cwd: rootDir, reject: false },
		)
		const output = parseNpmLsOutput(result.stdout)
		const ok = result.exitCode === 0
		const failingDependencies = ok
			? []
			: getFailingDependencies(expectedDependencies, output)
		return {
			ok,
			failingDependencies:
				ok || failingDependencies.length > 0
					? failingDependencies
					: expectedDependencies,
		}
	} catch (error) {
		console.warn(
			`⚠️  Failed to run npm ls in ${rootDir}:`,
			getErrorMessage(error),
		)
		return { ok: false, failingDependencies: expectedDependencies }
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
		.filter(
			(packageJsonPath) => !workspacePackageJsonPaths.has(packageJsonPath),
		)
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
	const expectedDependencies = Array.from(
		new Set([...dependencies, ...devDependencies, ...optionalDependencies]),
	)

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

	const npmLsResult = await checkDependenciesWithNpmLs(
		rootDir,
		expectedDependencies,
		packageManager,
	)
	const failingDependencies = new Set(npmLsResult.failingDependencies)
	const missingDependencies = dependencies.filter((dep) =>
		failingDependencies.has(dep),
	)
	const missingDevDependencies = devDependencies.filter((dep) =>
		failingDependencies.has(dep),
	)
	const missingOptionalDependencies = optionalDependencies.filter((dep) =>
		failingDependencies.has(dep),
	)
	// Optional dependencies should not trigger install requirement
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
