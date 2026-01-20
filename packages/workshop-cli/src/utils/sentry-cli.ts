import * as Sentry from '@sentry/node'
import { getEnv } from '@epic-web/workshop-utils/init-env'

type CliCommandContext = {
	command?: string
	subcommand?: string
	flags?: string[]
	interactive?: boolean
	help?: boolean
}

type CliSentry = {
	enabled: boolean
	setCommandContext: (update: Partial<CliCommandContext>) => void
	captureException: (error: unknown) => void
	flush: (timeoutMs?: number) => Promise<boolean>
}

const HELP_FLAGS = new Set(['--help', '-h'])
const SUBCOMMANDS = new Map<string, Set<string>>([
	['auth', new Set(['status', 'login', 'logout'])],
	['playground', new Set(['show', 'set', 'saved'])],
	['progress', new Set(['show', 'update'])],
	['config', new Set(['reset'])],
])

function extractFlags(args: string[]) {
	const flags = new Set<string>()
	for (let i = 0; i < args.length; i += 1) {
		const arg = args[i]
		if (!arg || arg === '--' || arg === '-' || !arg.startsWith('-')) {
			continue
		}
		if (arg.startsWith('--')) {
			const [flag] = arg.split('=')
			if (flag) flags.add(flag)
			if (!arg.includes('=') && args[i + 1] && !args[i + 1]?.startsWith('-')) {
				i += 1
			}
		} else {
			flags.add(arg)
			if (arg.length === 2 && args[i + 1] && !args[i + 1]?.startsWith('-')) {
				i += 1
			}
		}
	}
	return Array.from(flags).sort()
}

function deriveCommandContext(args: string[]): CliCommandContext {
	const interactive = args.length === 0
	const help = args.some((arg) => HELP_FLAGS.has(arg))
	const flags = extractFlags(args)
	let command: string | undefined
	let subcommand: string | undefined
	const firstNonFlagIndex = args.findIndex((arg) => !arg.startsWith('-'))
	if (firstNonFlagIndex >= 0) {
		command = args[firstNonFlagIndex]
		const allowedSubs = command ? SUBCOMMANDS.get(command) : undefined
		const candidate = args[firstNonFlagIndex + 1]
		if (allowedSubs && candidate && allowedSubs.has(candidate)) {
			subcommand = candidate
		}
	}
	if (!command) {
		if (help) {
			command = 'help'
		} else if (interactive) {
			command = 'chooser'
		}
	}
	return {
		command,
		subcommand,
		flags,
		interactive,
		help: help || command === 'help',
	}
}

function applyCommandContext(context: CliCommandContext) {
	Sentry.setTag('cli.command', context.command ?? 'unknown')
	Sentry.setTag('cli.subcommand', context.subcommand ?? 'none')
	if (context.interactive !== undefined) {
		Sentry.setTag('cli.interactive', context.interactive ? 'true' : 'false')
	}
	if (context.help !== undefined) {
		Sentry.setTag('cli.help', context.help ? 'true' : 'false')
	}
	Sentry.setContext('cli', {
		command: context.command ?? 'unknown',
		subcommand: context.subcommand ?? null,
		flags: context.flags ?? [],
		interactive: context.interactive ?? false,
		help: context.help ?? false,
		stdin_tty: Boolean(process.stdin.isTTY),
		stdout_tty: Boolean(process.stdout.isTTY),
	})
}

export function initCliSentry(args: string[]): CliSentry {
	const env = getEnv()
	const enabled = env.EPICSHOP_IS_PUBLISHED && Boolean(env.SENTRY_DSN)
	if (!enabled) {
		return {
			enabled,
			setCommandContext: () => {},
			captureException: () => {},
			flush: async () => true,
		}
	}

	Sentry.init({
		dsn: env.SENTRY_DSN,
		sendDefaultPii: false,
		environment: env.EPICSHOP_IS_PUBLISHED ? 'production' : 'development',
		tracesSampleRate: 1,
	})

	Sentry.setTags({
		epicshop_github_repo: env.EPICSHOP_GITHUB_REPO || 'unknown',
		epicshop_workshop_instance_id:
			env.EPICSHOP_WORKSHOP_INSTANCE_ID || 'unknown',
		epicshop_app_version: env.EPICSHOP_APP_VERSION || 'unknown',
		epicshop_published: env.EPICSHOP_IS_PUBLISHED ? 'true' : 'false',
	})

	let currentContext = deriveCommandContext(args)
	applyCommandContext(currentContext)

	return {
		enabled,
		setCommandContext(update) {
			currentContext = { ...currentContext, ...update }
			applyCommandContext(currentContext)
		},
		captureException(error) {
			Sentry.captureException(error)
		},
		flush(timeoutMs = 2000) {
			return Sentry.flush(timeoutMs)
		},
	}
}
