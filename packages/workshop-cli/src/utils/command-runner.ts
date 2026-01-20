import { getErrorMessage } from '@epic-web/workshop-utils/utils'
import { execa } from 'execa'

export type CommandResult = {
	success: boolean
	message?: string
	error?: Error
}

export function resolveCliCommand(command: string): string {
	// On Windows, package manager binaries are typically shimmed as *.cmd files.
	if (
		process.platform === 'win32' &&
		(command === 'npm' ||
			command === 'npx' ||
			command === 'pnpm' ||
			command === 'yarn')
	) {
		return `${command}.cmd`
	}
	return command
}

export function runCommand(
	command: string,
	args: string[],
	options: { cwd: string; silent?: boolean },
): Promise<CommandResult> {
	return execa(resolveCliCommand(command), args, {
		cwd: options.cwd,
		stdio: options.silent ? 'pipe' : 'inherit',
	}).then(
		() => ({ success: true }),
		(error: unknown) => {
			const message = getErrorMessage(error, 'Command failed')
			const err = error instanceof Error ? error : new Error(message)
			return { success: false, message, error: err }
		},
	)
}

export function runCommandInteractive(
	command: string,
	args: string[],
	options: { cwd: string },
): Promise<CommandResult> {
	return execa(resolveCliCommand(command), args, {
		cwd: options.cwd,
		stdio: 'inherit',
	}).then(
		() => ({ success: true }),
		(error: unknown) => {
			// If the process was terminated by a signal (e.g. user presses Ctrl+C),
			// treat it as success so we don't show a confusing error message.
			if (
				error &&
				typeof error === 'object' &&
				'signal' in error &&
				typeof (error as { signal?: unknown }).signal === 'string'
			) {
				return { success: true }
			}

			const message = getErrorMessage(error, 'Command failed')
			const err = error instanceof Error ? error : new Error(message)
			return { success: false, message, error: err }
		},
	)
}
