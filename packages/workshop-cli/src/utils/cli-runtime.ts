import chalk from 'chalk'

export function hasTty(): boolean {
	return Boolean(process.stdin.isTTY && process.stdout.isTTY)
}

export function isCiEnvironment(): boolean {
	const ci = process.env.CI
	if (!ci) return false
	const normalized = String(ci).trim().toLowerCase()
	return normalized !== '' && normalized !== '0' && normalized !== 'false'
}

type PromptGuardOptions = {
	/**
	 * What the prompt is for, used in the error message.
	 * Example: "select a workshop to add"
	 */
	reason: string
	/**
	 * Suggestions for how to run non-interactively (flags, args, etc).
	 */
	hints?: string[]
}

export function assertCanPrompt({
	reason,
	hints = [],
}: PromptGuardOptions): void {
	if (isCiEnvironment()) {
		throw new Error(
			[
				`${chalk.red('❌')} ${chalk.bold('CI mode: prompts are disabled.')}`,
				`This command needs to prompt to ${reason}, but ${chalk.cyan('CI=true')} is set.`,
				...formatHints(hints),
			].join('\n'),
		)
	}

	if (!hasTty()) {
		throw new Error(
			[
				`${chalk.red('❌')} ${chalk.bold('Non-interactive environment: no TTY detected.')}`,
				`This command needs to prompt to ${reason}, but stdin/stdout are not a TTY.`,
				...formatHints(hints),
			].join('\n'),
		)
	}
}

function formatHints(hints: string[]): string[] {
	if (hints.length === 0) return []
	return [
		'',
		chalk.bold('To run non-interactively, provide the required input:'),
		...hints.map((h) => `- ${h}`),
	]
}
