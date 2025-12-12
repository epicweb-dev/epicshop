#!/usr/bin/env node

import '@epic-web/workshop-utils/init-env'
import chalk from 'chalk'
import { matchSorter } from 'match-sorter'
import yargs, { type ArgumentsCamelCase, type Argv } from 'yargs'
import { hideBin } from 'yargs/helpers'

// Check for --help on start command before yargs parses
// (yargs exits before command handler when help is requested)
const args = hideBin(process.argv)
if (
	(args.includes('--help') || args.includes('-h')) &&
	(args.length === 0 || args[0] === 'start')
) {
	const { displayHelp } = await import('./commands/start.js')
	displayHelp()
	process.exit(0)
}

// Set up yargs CLI
const cli = yargs(args)
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
				.option('silent', {
					alias: 's',
					type: 'boolean',
					description: 'Run without output logs',
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
				.example('$0 start --silent', 'Start the workshop without output logs')
		},
		async (
			argv: ArgumentsCamelCase<{
				verbose?: boolean
				silent?: boolean
				appLocation?: string
			}>,
		) => {
			// run migrations before starting
			await import('./commands/migrate.js')
				.then(({ migrate }) => migrate())
				.catch((error) => {
					// Log migration errors but don't fail the start command
					if (!argv.silent) {
						console.error(chalk.yellow('⚠️  Migration failed:'), error)
					}
				})

			// kick off a warmup while we start the server
			import('./commands/warm.js')
				.then(({ warm }) => warm({ silent: true }))
				.catch((error) => {
					// Log warmup errors but don't fail the start command
					if (!argv.silent) {
						console.error(chalk.yellow('⚠️  Warmup failed:'), error)
					}
				})

			const { start } = await import('./commands/start.js')
			const result = await start({
				appLocation: argv.appLocation,
				verbose: argv.verbose,
				silent: argv.silent,
			})

			if (!result.success) {
				if (!argv.silent) {
					console.error(
						chalk.red(
							`❌ ${result.message || 'Failed to start workshop application'}`,
						),
					)
					if (result.error) {
						console.error(chalk.red(result.error.message))
					}
				}
				process.exit(1)
			}
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
			try {
				const { update } = await import('./commands/update.js')
				const result = await update({ silent: argv.silent })
				if (!result.success) {
					if (!argv.silent) {
						console.error(
							chalk.red(`❌ ${result.message || 'Failed to update workshop'}`),
						)
						if (result.error) {
							console.error(chalk.red(result.error.message))
						}
					}
					process.exit(1)
				}
			} catch (error) {
				if (!argv.silent) {
					console.error(chalk.red('❌ Update failed:'), error)
				}
				process.exit(1)
			}
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
			try {
				const { warm } = await import('./commands/warm.js')
				const result = await warm({ silent: argv.silent })
				if (!result.success) {
					if (!argv.silent) {
						console.error(
							chalk.red(`❌ ${result.message || 'Failed to warm up workshop'}`),
						)
						if (result.error) {
							console.error(chalk.red(result.error.message))
						}
					}
					process.exit(1)
				}
			} catch (error) {
				if (!argv.silent) {
					console.error(chalk.red('❌ Warmup failed:'), error)
				}
				process.exit(1)
			}
		},
	)
	.command(
		['migrate'],
		'Run any necessary migrations for workshop data',
		(yargs: Argv) => {
			return yargs
				.option('silent', {
					alias: 's',
					type: 'boolean',
					description: 'Run without output logs',
					default: false,
				})
				.example('$0 migrate', 'Run necessary migrations')
				.example('$0 migrate --silent', 'Run migrations silently')
		},
		async (argv: ArgumentsCamelCase<{ silent?: boolean }>) => {
			try {
				const { migrate } = await import('./commands/migrate.js')
				const result = await migrate()
				if (argv.silent) return
				if (result === null) {
					console.log(chalk.green('✅ No migrations needed'))
					return
				}

				if (result.success) {
					console.log(
						chalk.green(
							result.message || '✅ Migrations completed successfully',
						),
					)
				} else {
					console.error(
						chalk.red(`❌ ${result.message || 'Failed to run migrations'}`),
					)
					if (result.error) {
						console.error(chalk.red(result.error.message))
					}
					process.exit(1)
				}
			} catch (error) {
				if (!argv.silent) {
					console.error(chalk.red('❌ Migration failed:'), error)
				}
				process.exit(1)
			}
		},
	)
	.command(
		'workshops [subcommand]',
		'Manage local workshops',
		(yargs: Argv) => {
			return yargs
				.command(
					'init',
					'Initialize epicshop and start the tutorial (first-time setup)',
					(yargs: Argv) => {
						return yargs.example(
							'$0 workshops init',
							'Run the first-time setup wizard',
						)
					},
					async () => {
						const { onboarding } = await import('./commands/workshops.js')
						const result = await onboarding()
						if (!result.success) {
							process.exit(1)
						}
					},
				)
				.command(
					'add <repo-name>',
					'Add a workshop by cloning from epicweb-dev GitHub org',
					(yargs: Argv) => {
						return yargs
							.positional('repo-name', {
								describe: 'Repository name from epicweb-dev org',
								type: 'string',
								demandOption: true,
							})
							.option('directory', {
								alias: 'd',
								type: 'string',
								description:
									'Directory to clone into (defaults to configured repos directory)',
							})
							.option('silent', {
								alias: 's',
								type: 'boolean',
								description: 'Run without output logs',
								default: false,
							})
							.example(
								'$0 workshops add full-stack-foundations',
								'Clone and set up the full-stack-foundations workshop',
							)
							.example(
								'$0 workshops add web-forms --directory ~/my-workshops',
								'Clone workshop to a custom directory',
							)
					},
					async (
						argv: ArgumentsCamelCase<{
							repoName: string
							directory?: string
							silent?: boolean
						}>,
					) => {
						const { add } = await import('./commands/workshops.js')
						const result = await add({
							repoName: argv.repoName,
							directory: argv.directory,
							silent: argv.silent,
						})
						if (!result.success) {
							process.exit(1)
						}
					},
				)
				.command(
					'list',
					'List all added workshops',
					(yargs: Argv) => {
						return yargs
							.option('silent', {
								alias: 's',
								type: 'boolean',
								description: 'Run without output logs',
								default: false,
							})
							.example('$0 workshops list', 'List all added workshops')
					},
					async (argv: ArgumentsCamelCase<{ silent?: boolean }>) => {
						const { list } = await import('./commands/workshops.js')
						const result = await list({ silent: argv.silent })
						if (!result.success) {
							process.exit(1)
						}
					},
				)
				.command(
					'remove [workshop]',
					'Remove a workshop (deletes the directory)',
					(yargs: Argv) => {
						return yargs
							.positional('workshop', {
								describe:
									'Workshop name, repo name, or title to remove (prompts if not provided)',
								type: 'string',
							})
							.option('silent', {
								alias: 's',
								type: 'boolean',
								description: 'Run without output logs',
								default: false,
							})
							.example('$0 workshops remove', 'Select a workshop to remove')
							.example(
								'$0 workshops remove full-stack-foundations',
								'Remove a specific workshop',
							)
					},
					async (
						argv: ArgumentsCamelCase<{
							workshop?: string
							silent?: boolean
						}>,
					) => {
						const { remove } = await import('./commands/workshops.js')
						const result = await remove({
							workshop: argv.workshop,
							silent: argv.silent,
						})
						if (!result.success) {
							process.exit(1)
						}
					},
				)
				.command(
					'start [workshop]',
					'Start a workshop (interactive selection if not specified)',
					(yargs: Argv) => {
						return yargs
							.positional('workshop', {
								describe: 'Workshop name, repo name, or ID to start',
								type: 'string',
							})
							.option('silent', {
								alias: 's',
								type: 'boolean',
								description: 'Run without output logs',
								default: false,
							})
							.example('$0 workshops start', 'Select and start a workshop')
							.example(
								'$0 workshops start full-stack-foundations',
								'Start a specific workshop',
							)
					},
					async (
						argv: ArgumentsCamelCase<{
							workshop?: string
							silent?: boolean
						}>,
					) => {
						const { startWorkshop } = await import('./commands/workshops.js')
						const result = await startWorkshop({
							workshop: argv.workshop,
							silent: argv.silent,
						})
						if (!result.success) {
							process.exit(1)
						}
					},
				)
				.command(
					'open [workshop]',
					'Open a workshop in your editor',
					(yargs: Argv) => {
						return yargs
							.positional('workshop', {
								describe: 'Workshop name, repo name, or ID to open',
								type: 'string',
							})
							.option('silent', {
								alias: 's',
								type: 'boolean',
								description: 'Run without output logs',
								default: false,
							})
							.example('$0 workshops open', 'Select and open a workshop')
							.example(
								'$0 workshops open full-stack-foundations',
								'Open a specific workshop',
							)
					},
					async (
						argv: ArgumentsCamelCase<{
							workshop?: string
							silent?: boolean
						}>,
					) => {
						const { openWorkshop } = await import('./commands/workshops.js')
						const result = await openWorkshop({
							workshop: argv.workshop,
							silent: argv.silent,
						})
						if (!result.success) {
							process.exit(1)
						}
					},
				)
				.command(
					'config',
					'View or update workshop configuration',
					(yargs: Argv) => {
						return yargs
							.option('repos-dir', {
								type: 'string',
								description: 'Set the default directory for workshop repos',
							})
							.option('silent', {
								alias: 's',
								type: 'boolean',
								description: 'Run without output logs',
								default: false,
							})
							.example('$0 workshops config', 'View current configuration')
							.example(
								'$0 workshops config --repos-dir ~/epicweb',
								'Set the repos directory',
							)
					},
					async (
						argv: ArgumentsCamelCase<{
							reposDir?: string
							silent?: boolean
						}>,
					) => {
						const { config } = await import('./commands/workshops.js')
						const result = await config({
							reposDir: argv.reposDir,
							silent: argv.silent,
						})
						if (!result.success) {
							process.exit(1)
						}
					},
				)
				.demandCommand(0, 1)
		},
		async () => {
			// Show subcommand chooser
			const { search } = await import('@inquirer/prompts')

			const allChoices = [
				{
					name: 'Start a workshop',
					value: 'start' as const,
					description: 'Start a workshop (interactive selection)',
				},
				{
					name: 'Open a workshop in editor',
					value: 'open' as const,
					description: 'Open a workshop in your code editor',
				},
				{
					name: 'List workshops',
					value: 'list' as const,
					description: 'List all added workshops',
				},
				{
					name: 'Add a workshop',
					value: 'add' as const,
					description: 'Add a workshop by cloning from epicweb-dev GitHub org',
				},
				{
					name: 'Remove a workshop',
					value: 'remove' as const,
					description: 'Remove a workshop (deletes the directory)',
				},
				{
					name: 'View/update configuration',
					value: 'config' as const,
					description: 'View or update workshop configuration',
				},
				{
					name: 'Initialize (first-time setup)',
					value: 'init' as const,
					description: 'Initialize epicshop and start the tutorial',
				},
			]

			const subcommand = await search({
				message: 'What would you like to do?',
				source: async (input) => {
					if (!input) {
						return allChoices
					}
					return matchSorter(allChoices, input, {
						keys: ['name', 'value', 'description'],
					})
				},
			})

			switch (subcommand) {
				case 'init': {
					const { onboarding } = await import('./commands/workshops.js')
					const result = await onboarding()
					if (!result.success) {
						process.exit(1)
					}
					break
				}
				case 'add': {
					const { input } = await import('@inquirer/prompts')
					const repoName = await input({
						message: 'Enter the repository name from epicweb-dev org:',
						validate: (value) => {
							if (!value.trim()) {
								return 'Please enter a repository name'
							}
							return true
						},
					})
					const { add } = await import('./commands/workshops.js')
					const result = await add({ repoName })
					if (!result.success) {
						process.exit(1)
					}
					break
				}
				case 'list': {
					const { list } = await import('./commands/workshops.js')
					const result = await list({})
					if (!result.success) {
						process.exit(1)
					}
					break
				}
				case 'remove': {
					const { remove } = await import('./commands/workshops.js')
					const result = await remove({})
					if (!result.success) {
						process.exit(1)
					}
					break
				}
				case 'start': {
					const { startWorkshop } = await import('./commands/workshops.js')
					const result = await startWorkshop({})
					if (!result.success) {
						process.exit(1)
					}
					break
				}
				case 'open': {
					const { openWorkshop } = await import('./commands/workshops.js')
					const result = await openWorkshop({})
					if (!result.success) {
						process.exit(1)
					}
					break
				}
				case 'config': {
					const { config } = await import('./commands/workshops.js')
					const result = await config({})
					if (!result.success) {
						process.exit(1)
					}
					break
				}
			}
		},
	)
	.epilogue(
		`For more information, visit: https://github.com/epicweb-dev/epicshop`,
	)
	.strict()
	.demandCommand(0, 1, '', 'Too many commands specified')

// Parse and execute
try {
	await cli.parse()
} catch (error) {
	console.error(chalk.red('❌ Error:'), error)
	process.exit(1)
}
