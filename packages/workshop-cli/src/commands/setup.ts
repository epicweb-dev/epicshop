import fs from 'node:fs'
import path from 'node:path'
import {
	getPackageManager,
	isPackageManagerConfigured,
	type PackageManager,
} from '@epic-web/workshop-utils/workshops.server'
import { getErrorMessage } from '@epic-web/workshop-utils/utils'
import chalk from 'chalk'
import { execa } from 'execa'
import {
	resolveCliCommand,
	runCommand,
	type CommandResult,
} from '../utils/command-runner.js'
import {
	formatPackageManagerCommand,
	getPackageManagerInstallArgs,
	getPackageManagerRunArgs,
} from '../utils/package-manager.js'

export type SetupOptions = {
	cwd?: string
	silent?: boolean
}

export type SetupResult = {
	success: boolean
	message?: string
	error?: Error
}

type PackageJson = {
	scripts?: Record<string, string>
}

function isPackageJson(value: unknown): value is PackageJson {
	if (!value || typeof value !== 'object') return false
	if (!('scripts' in value)) return true
	const scriptsValue = (value as { scripts?: unknown }).scripts
	if (scriptsValue === undefined) return true
	if (!scriptsValue || typeof scriptsValue !== 'object') return false
	return Object.values(scriptsValue).every(
		(script) => typeof script === 'string',
	)
}

async function getPackageManagerVersion(
	packageManager: PackageManager,
): Promise<{ success: boolean; version?: string; error?: Error }> {
	try {
		const result = await execa(resolveCliCommand(packageManager), ['--version'], {
			stdio: 'pipe',
		})
		return { success: true, version: result.stdout.trim() }
	} catch (error: unknown) {
		const message = getErrorMessage(error, 'Failed to check package manager')
		const err = error instanceof Error ? error : new Error(message)
		return { success: false, error: err }
	}
}

function isNpmVersionSupported(version: string): boolean {
	const [majorString, minorString] = version.split('.')
	const major = Number(majorString)
	const minor = Number(minorString)
	if (!Number.isFinite(major) || !Number.isFinite(minor)) return false
	return major > 8 || (major === 8 && minor >= 16)
}

function formatCommandResultError(
	result: CommandResult,
	fallbackMessage: string,
): SetupResult {
	return {
		success: false,
		message: result.message ?? fallbackMessage,
		error: result.error,
	}
}

export async function setup(
	options: SetupOptions = {},
): Promise<SetupResult> {
	const { silent = false } = options
	const cwd = options.cwd ? path.resolve(options.cwd) : process.cwd()
	const packageJsonPath = path.join(cwd, 'package.json')

	try {
		await fs.promises.access(packageJsonPath)
	} catch {
		const message = `package.json not found at ${packageJsonPath}`
		if (!silent) {
			console.error(chalk.red(`❌ ${message}`))
		}
		return { success: false, message, error: new Error(message) }
	}

	let scripts: Record<string, string> | undefined
	try {
		const parsed = JSON.parse(
			await fs.promises.readFile(packageJsonPath, 'utf8'),
		) as unknown
		if (isPackageJson(parsed)) {
			scripts = parsed.scripts
		}
	} catch (error) {
		const message = getErrorMessage(error, 'Failed to read package.json')
		if (!silent) {
			console.error(chalk.red(`❌ ${message}`))
		}
		return { success: false, message, error: error as Error }
	}

	const packageManager = await getPackageManager()
	const isConfigured = await isPackageManagerConfigured()
	const managerLabel = isConfigured
		? packageManager
		: `${packageManager} (default)`

	const versionResult = await getPackageManagerVersion(packageManager)
	if (!versionResult.success || !versionResult.version) {
		const message = `Failed to run ${packageManager} --version. Please ensure ${packageManager} is installed.`
		if (!silent) {
			console.error(chalk.red(`❌ ${message}`))
		}
		return {
			success: false,
			message,
			error: versionResult.error ?? new Error(message),
		}
	}

	if (packageManager === 'npm' && !isNpmVersionSupported(versionResult.version)) {
		const message = `npm version is ${versionResult.version} which is out of date. Please install npm@8.16.0 or greater.`
		if (!silent) {
			console.error(chalk.red(`❌ ${message}`))
		}
		return { success: false, message, error: new Error(message) }
	}

	const installArgs = getPackageManagerInstallArgs(packageManager)
	const installCommand = formatPackageManagerCommand(
		packageManager,
		installArgs,
	)

	if (!silent) {
		console.log(
			chalk.cyan(
				`📦 Installing dependencies using ${chalk.bold(managerLabel)}...`,
			),
		)
		console.log(
			chalk.gray(
				`   To change this, run: npx epicshop config --package-manager <npm|pnpm|yarn|bun>`,
			),
		)
		console.log(chalk.gray(`   Running: ${installCommand}`))
	}

	const installResult = await runCommand(packageManager, installArgs, {
		cwd,
		silent,
	})

	if (!installResult.success) {
		return formatCommandResultError(
			installResult,
			'Failed to install dependencies',
		)
	}

	const hasCustomSetup = Boolean(scripts?.['setup:custom'])
	if (hasCustomSetup) {
		const customArgs = getPackageManagerRunArgs(packageManager, 'setup:custom')
		const customCommand = formatPackageManagerCommand(
			packageManager,
			customArgs,
		)

		if (!silent) {
			console.log(chalk.cyan(`🔧 Running ${customCommand}...`))
		}

		const customResult = await runCommand(packageManager, customArgs, {
			cwd,
			silent,
		})

		if (!customResult.success) {
			return formatCommandResultError(
				customResult,
				'Failed to run setup:custom',
			)
		}
	}

	const message = 'Workshop setup complete'
	if (!silent) {
		console.log(chalk.green(`✅ ${message}`))
	}
	return { success: true, message }
}
