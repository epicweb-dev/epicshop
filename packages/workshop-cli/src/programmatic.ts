import { spawn, execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

export interface StartCommandOptions {
	appLocation?: string
	verbose?: boolean
}

export interface CommandResult {
	success: boolean
	message?: string
	error?: Error
	stdout?: string
	stderr?: string
}

/**
 * Get the path to the CLI executable
 */
function getCliPath(): string {
	try {
		// Try to get the path from the current package
		const currentDir = path.dirname(fileURLToPath(import.meta.url))
		const cliPath = path.resolve(currentDir, '../dist/esm/cli.js')
		return cliPath
	} catch {
		// Fallback to epicshop command if available in PATH
		return 'epicshop'
	}
}

/**
 * Execute a CLI command and return the result
 */
async function executeCliCommand(args: string[]): Promise<CommandResult> {
	return new Promise((resolve) => {
		const cliPath = getCliPath()
		const child = spawn('node', [cliPath, ...args], {
			stdio: ['pipe', 'pipe', 'pipe'],
		})

		let stdout = ''
		let stderr = ''

		if (child.stdout) {
			child.stdout.on('data', (data) => {
				stdout += data.toString()
			})
		}

		if (child.stderr) {
			child.stderr.on('data', (data) => {
				stderr += data.toString()
			})
		}

		child.on('close', (code) => {
			resolve({
				success: code === 0,
				message: code === 0 ? 'Command executed successfully' : `Command failed with exit code ${code}`,
				stdout,
				stderr,
				error: code !== 0 ? new Error(`Command failed with exit code ${code}`) : undefined,
			})
		})

		child.on('error', (error) => {
			resolve({
				success: false,
				message: 'Failed to execute command',
				error,
				stdout,
				stderr,
			})
		})
	})
}

/**
 * Start the workshop application programmatically
 */
export async function startCommand(options: StartCommandOptions = {}): Promise<CommandResult> {
	const args = ['start']
	
	if (options.verbose) {
		args.push('--verbose')
	}
	
	if (options.appLocation) {
		args.push('--app-location', options.appLocation)
	}

	return executeCliCommand(args)
}

/**
 * Update the workshop to the latest version
 */
export async function updateCommand(): Promise<CommandResult> {
	return executeCliCommand(['update'])
}

/**
 * Warm up the workshop application caches (apps, diffs)
 */
export async function warmCommand(): Promise<CommandResult> {
	return executeCliCommand(['warm'])
}

/**
 * Check for available updates (using the CLI help as a simple check)
 */
export async function checkForUpdates(): Promise<CommandResult & { updatesAvailable?: number; diffLink?: string }> {
	// This is a simplified version - in a real implementation you'd need to
	// either expose a separate command or parse the output differently
	const result = await executeCliCommand(['--help'])
	return {
		...result,
		message: 'Check for updates functionality would need to be exposed as a separate CLI command',
	}
}

/**
 * Open the workshop application in the browser
 * Note: This functionality would need to be exposed as a separate CLI command
 */
export async function openWorkshop(): Promise<CommandResult> {
	return {
		success: false,
		message: 'Open workshop functionality would need to be exposed as a separate CLI command',
	}
}

/**
 * Dismiss update notifications
 * Note: This functionality would need to be exposed as a separate CLI command
 */
export async function dismissUpdateNotification(): Promise<CommandResult> {
	return {
		success: false,
		message: 'Dismiss notification functionality would need to be exposed as a separate CLI command',
	}
}

/**
 * Initialize the environment
 * Note: The CLI handles this automatically, so this is mainly for API compatibility
 */
export async function initializeEnvironment(): Promise<CommandResult> {
	return {
		success: true,
		message: 'Environment initialization is handled automatically by the CLI',
	}
}

/**
 * Execute a custom CLI command with arguments
 */
export async function executeCommand(command: string, args: string[] = []): Promise<CommandResult> {
	return executeCliCommand([command, ...args])
}

/**
 * Get the CLI version
 */
export async function getVersion(): Promise<CommandResult & { version?: string }> {
	try {
		const packageJsonPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../package.json')
		const packageJson = JSON.parse(await import('fs').then(fs => fs.promises.readFile(packageJsonPath, 'utf8')))
		
		return {
			success: true,
			message: `CLI version: ${packageJson.version}`,
			version: packageJson.version,
		}
	} catch (error) {
		return {
			success: false,
			message: 'Failed to get version',
			error: error instanceof Error ? error : new Error(String(error)),
		}
	}
}

/**
 * Check if the CLI is available
 */
export async function checkCliAvailability(): Promise<CommandResult> {
	try {
		const result = await executeCliCommand(['--help'])
		return {
			success: result.success,
			message: result.success ? 'CLI is available' : 'CLI is not available',
		}
	} catch (error) {
		return {
			success: false,
			message: 'CLI is not available',
			error: error instanceof Error ? error : new Error(String(error)),
		}
	}
}