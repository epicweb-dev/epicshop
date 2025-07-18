#!/usr/bin/env node

import chalk from 'chalk'
import yargs, { type ArgumentsCamelCase, type Argv } from 'yargs'
import { hideBin } from 'yargs/helpers'

// Set up yargs CLI
const cli = yargs(hideBin(process.argv))
	.scriptName('epicshop')
	.usage('$0 <command> [options]')
	.help('help')
	.alias('h', 'help')
	.version(false)
	.command(
		['start', '$0'],
		'Start the workshop application',
		(yargs: Argv) => {
			return yargs
				.option('verbose', {
					alias: 'v',
					type: 'boolean',
					description: 'Show verbose output',
					default: false,
				})
				.option('app-location', {
					type: 'string',
					description: 'Path to the workshop app directory',
				})
				.example('$0 start', 'Start the workshop with interactive features')
				.example(
					'$0 start --app-location /path/to/workshop-app',
					'Start with custom app location',
				)
		},
		async (
			argv: ArgumentsCamelCase<{ verbose?: boolean; appLocation?: string }>,
		) => {
			// kick off a warmup while we start the server
			void import('./commands/warm.js').then(({ warm }) =>
				warm({ silent: true }),
			)

			const { start } = await import('./commands/start.js')
			await start({
				appLocation: argv.appLocation,
				verbose: argv.verbose,
			})
		},
	)
	.command(
		['update', 'upgrade'],
		'Update the workshop to the latest version',
		(yargs: Argv) => {
			return yargs
				.option('silent', {
					alias: 's',
					type: 'boolean',
					description: 'Run without output logs',
					default: false,
				})
				.example('$0 update', 'Update workshop to latest version')
				.example(
					'$0 update --silent',
					'Update workshop to latest version silently',
				)
		},
		async (argv: ArgumentsCamelCase<{ silent?: boolean }>) => {
			const { update } = await import('./commands/update.js')
			await update({ silent: argv.silent })
		},
	)
	.command(
		['warm'],
		'Warm up the workshop application caches (apps, diffs)',
		(yargs: Argv) => {
			return yargs
				.option('silent', {
					alias: 's',
					type: 'boolean',
					description: 'Run without output logs',
					default: false,
				})
				.example('$0 warm', 'Warm up workshop caches')
				.example('$0 warm --silent', 'Warm up workshop caches silently')
		},
		async (argv: ArgumentsCamelCase<{ silent?: boolean }>) => {
			const { warm } = await import('./commands/warm.js')
			await warm({ silent: argv.silent })
		},
	)
	.epilogue(
		`For more information, visit: https://github.com/epicweb-dev/epicshop`,
	)
	.strict()
	.demandCommand(0, 1, '', 'Too many commands specified')

// Parse and execute
try {
	const { init: initEnv, getEnv } = await import(
		'@epic-web/workshop-utils/env.server'
	)
	await initEnv()
	;(global as any).ENV = getEnv()
	await cli.parse()
} catch (error) {
	console.error(chalk.red('❌ Error:'), error)
	process.exit(1)
}
