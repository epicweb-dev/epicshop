import fs from 'node:fs'
import path from 'node:path'
import { getErrorMessage } from '@epic-web/workshop-utils/utils'
import chalk from 'chalk'
import { runCommand, type CommandResult } from '../utils/command-runner.js'

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

/**
 * Install workshop dependencies in the current directory.
 * Must be run from within a workshop directory (containing package.json).
 *
 * Automatically detects and uses the package manager based on how epicshop was
 * invoked (e.g., pnpm dlx epicshop setup uses pnpm, bunx epicshop setup uses bun).
 * This is handled by pkgmgr, which detects the runtime package manager.
 */
export async function setup(options: SetupOptions = {}): Promise<SetupResult> {
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

	if (!silent) {
		console.log(
			chalk.cyan(`📦 Installing dependencies using ${chalk.bold('pkgmgr')}...`),
		)
		console.log(
			chalk.gray(
				`   pkgmgr automatically detects your package manager (npm, pnpm, yarn, or bun)`,
			),
		)
		console.log(chalk.gray(`   Running: pkgmgr install`))
	}

	const installResult = await runCommand('pkgmgr', ['install'], {
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
		if (!silent) {
			console.log(chalk.cyan(`🔧 Running npm run setup:custom...`))
		}

		const customResult = await runCommand('npm', ['run', 'setup:custom'], {
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
