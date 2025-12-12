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

// Helper function to colorize help output
function formatHelp(helpText: string): string {
	return helpText
		.replace(/^(Commands:)/gm, chalk.cyan.bold('$1'))
		.replace(/^(Options:)/gm, chalk.cyan.bold('$1'))
		.replace(/^(Examples:)/gm, chalk.cyan.bold('$1'))
		.replace(/^\s{2}(\S+)\s{2,}/gm, (match, cmd) => {
			return match.replace(cmd, chalk.green(cmd))
		})
		.replace(/--[\w-]+/g, (match) => chalk.yellow(match))
		.replace(/-\w(?=\s|,)/g, (match) => chalk.yellow(match))
}

// Set up yargs CLI
const cli = yargs(args)
	.scriptName('epicshop')
	.usage(chalk.bold('$0 <command> [options]'))
	.help('help')
	.alias('h', 'help')
	.version(false)
	.showHelpOnFail(true)
	.command(
		'start [workshop]',
		'Start a workshop (auto-detects if inside a workshop directory)',
		(yargs: Argv) => {
			return yargs
				.positional('workshop', {
					describe: 'Workshop name to start (optional if inside a workshop)',
					type: 'string',
				})
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
				.example('$0 start', 'Start the current workshop or select one')
				.example(
					'$0 start full-stack-foundations',
					'Start a specific workshop',
				)
				.example(
					'$0 start --app-location /path/to/workshop-app',
					'Start with custom app location',
				)
		},
		async (
			argv: ArgumentsCamelCase<{
				workshop?: string
				verbose?: boolean
				silent?: boolean
				appLocation?: string
			}>,
		) => {
			const { detectCurrentWorkshop } = await import('./commands/workshops.js')
			const currentWorkshop = await detectCurrentWorkshop()

			// If a specific workshop is requested OR we're inside a workshop, start it directly
			if (argv.workshop || currentWorkshop) {
				if (argv.workshop) {
					// Start a specific workshop from the collection
					const { startWorkshop } = await import('./commands/workshops.js')
					const result = await startWorkshop({
						workshop: argv.workshop,
						silent: argv.silent,
					})
					if (!result.success) {
						process.exit(1)
					}
				} else {
					// We're inside a workshop, run the current behavior
					// run migrations before starting
					await import('./commands/migrate.js')
						.then(({ migrate }) => migrate())
						.catch((error) => {
							if (!argv.silent) {
								console.error(chalk.yellow('⚠️  Migration failed:'), error)
							}
						})

					// kick off a warmup while we start the server
					import('./commands/warm.js')
						.then(({ warm }) => warm({ silent: true }))
						.catch((error) => {
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
				}
			} else {
				// Not inside a workshop and no workshop specified, show selection
				const { startWorkshop } = await import('./commands/workshops.js')
				const result = await startWorkshop({ silent: argv.silent })
				if (!result.success) {
					process.exit(1)
				}
			}
		},
	)
	.command(
		'init',
		'Initialize epicshop and start the tutorial (first-time setup)',
		(yargs: Argv) => {
			return yargs.example('$0 init', 'Run the first-time setup wizard')
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
					'$0 add full-stack-foundations',
					'Clone and set up the full-stack-foundations workshop',
				)
				.example(
					'$0 add web-forms --directory ~/my-workshops',
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
				.example('$0 list', 'List all added workshops')
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
						'Workshop to remove (auto-detects if inside a workshop directory)',
					type: 'string',
				})
				.option('silent', {
					alias: 's',
					type: 'boolean',
					description: 'Run without output logs',
					default: false,
				})
				.example('$0 remove', 'Remove current workshop or select one')
				.example(
					'$0 remove full-stack-foundations',
					'Remove a specific workshop',
				)
		},
		async (
			argv: ArgumentsCamelCase<{
				workshop?: string
				silent?: boolean
			}>,
		) => {
			const { detectCurrentWorkshop, remove } = await import(
				'./commands/workshops.js'
			)

			let workshopToRemove = argv.workshop

			// If no workshop specified, check if we're inside one
			if (!workshopToRemove) {
				const currentWorkshop = await detectCurrentWorkshop()
				if (currentWorkshop) {
					workshopToRemove = currentWorkshop.repoName
				}
			}

			const result = await remove({
				workshop: workshopToRemove,
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
					describe:
						'Workshop to open (auto-detects if inside a workshop directory)',
					type: 'string',
				})
				.option('silent', {
					alias: 's',
					type: 'boolean',
					description: 'Run without output logs',
					default: false,
				})
				.example('$0 open', 'Open current workshop or select one')
				.example(
					'$0 open full-stack-foundations',
					'Open a specific workshop',
				)
		},
		async (
			argv: ArgumentsCamelCase<{
				workshop?: string
				silent?: boolean
			}>,
		) => {
			const { detectCurrentWorkshop, openWorkshop } = await import(
				'./commands/workshops.js'
			)

			let workshopToOpen = argv.workshop

			// If no workshop specified, check if we're inside one
			if (!workshopToOpen) {
				const currentWorkshop = await detectCurrentWorkshop()
				if (currentWorkshop) {
					workshopToOpen = currentWorkshop.repoName
				}
			}

			const result = await openWorkshop({
				workshop: workshopToOpen,
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
				.example('$0 config', 'View current configuration')
				.example('$0 config --repos-dir ~/epicweb', 'Set the repos directory')
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
	.command(
		['update', 'upgrade'],
		'Update the current workshop or select one to update',
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
			const { detectCurrentWorkshop } = await import('./commands/workshops.js')
			const currentWorkshop = await detectCurrentWorkshop()

			if (currentWorkshop) {
				// Inside a workshop, run update on it
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
			} else {
				// Not inside a workshop, prompt user to select one
				const { listWorkshops, getWorkshop } = await import(
					'@epic-web/workshop-utils/workshops.server'
				)
				const workshops = await listWorkshops()

				if (workshops.length === 0) {
					if (!argv.silent) {
						console.log(
							chalk.yellow(
								`No workshops found. Use 'epicshop add <repo-name>' to add one.`,
							),
						)
					}
					process.exit(1)
				}

				const { search } = await import('@inquirer/prompts')

				const allChoices = workshops.map((w: { title: string; repoName: string; path: string }) => ({
					name: `${w.title} (${w.repoName})`,
					value: w.repoName,
					description: w.path,
				}))

				try {
					const selectedWorkshop = await search({
						message: 'Select a workshop to update:',
						source: async (input) => {
							if (!input) {
								return allChoices
							}
							return matchSorter(allChoices, input, {
								keys: ['name', 'value', 'description'],
							})
						},
					})

					const workshop = await getWorkshop(selectedWorkshop)
					if (!workshop) {
						if (!argv.silent) {
							console.error(
								chalk.red(`❌ Workshop "${selectedWorkshop}" not found`),
							)
						}
						process.exit(1)
					}

					// Change to workshop directory and run update
					const originalCwd = process.cwd()
					process.chdir(workshop.path)

					try {
						const { update } = await import('./commands/update.js')
						const result = await update({ silent: argv.silent })
						if (!result.success) {
							if (!argv.silent) {
								console.error(
									chalk.red(
										`❌ ${result.message || 'Failed to update workshop'}`,
									),
								)
								if (result.error) {
									console.error(chalk.red(result.error.message))
								}
							}
							process.exit(1)
						}
					} finally {
						process.chdir(originalCwd)
					}
				} catch (error) {
					if ((error as Error).message === 'USER_QUIT') {
						process.exit(0)
					}
					throw error
				}
			}
		},
	)
	.command(
		'warm',
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
			const { detectCurrentWorkshop } = await import('./commands/workshops.js')
			const currentWorkshop = await detectCurrentWorkshop()

			if (currentWorkshop) {
				// Inside a workshop, warm it
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
			} else {
				// Not inside a workshop, prompt user to select one
				const { listWorkshops, getWorkshop } = await import(
					'@epic-web/workshop-utils/workshops.server'
				)
				const workshops = await listWorkshops()

				if (workshops.length === 0) {
					if (!argv.silent) {
						console.log(
							chalk.yellow(
								`No workshops found. Use 'epicshop add <repo-name>' to add one.`,
							),
						)
					}
					process.exit(1)
				}

				const { search } = await import('@inquirer/prompts')

				const allChoices = workshops.map((w: { title: string; repoName: string; path: string }) => ({
					name: `${w.title} (${w.repoName})`,
					value: w.repoName,
					description: w.path,
				}))

				try {
					const selectedWorkshop = await search({
						message: 'Select a workshop to warm:',
						source: async (input) => {
							if (!input) {
								return allChoices
							}
							return matchSorter(allChoices, input, {
								keys: ['name', 'value', 'description'],
							})
						},
					})

					const workshop = await getWorkshop(selectedWorkshop)
					if (!workshop) {
						if (!argv.silent) {
							console.error(
								chalk.red(`❌ Workshop "${selectedWorkshop}" not found`),
							)
						}
						process.exit(1)
					}

					// Change to workshop directory and run warm
					const originalCwd = process.cwd()
					process.chdir(workshop.path)

					try {
						const { warm } = await import('./commands/warm.js')
						const result = await warm({ silent: argv.silent })
						if (!result.success) {
							if (!argv.silent) {
								console.error(
									chalk.red(
										`❌ ${result.message || 'Failed to warm up workshop'}`,
									),
								)
								if (result.error) {
									console.error(chalk.red(result.error.message))
								}
							}
							process.exit(1)
						}
					} finally {
						process.chdir(originalCwd)
					}
				} catch (error) {
					if ((error as Error).message === 'USER_QUIT') {
						process.exit(0)
					}
					throw error
				}
			}
		},
	)
	.command(
		'migrate',
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
	.epilogue(
		`For more information, visit: ${chalk.cyan('https://github.com/epicweb-dev/epicshop')}`,
	)
	.strict()
	.demandCommand(0, 1, '', 'Too many commands specified')

// Parse and execute - show command chooser if no command provided
try {
	const parsed = await cli.parse()

	// If no command was provided (empty args or just options), show command chooser
	if (args.length === 0 || (parsed._ && parsed._.length === 0 && !args[0]?.startsWith('-'))) {
		// Check if we're inside a workshop first
		const { detectCurrentWorkshop } = await import('./commands/workshops.js')
		const currentWorkshop = await detectCurrentWorkshop()

		const { search } = await import('@inquirer/prompts')

		const baseChoices = [
			{
				name: `${chalk.green('start')} - Start a workshop`,
				value: 'start' as const,
				description: currentWorkshop
					? `Start ${currentWorkshop.title}`
					: 'Interactive workshop selection',
			},
			{
				name: `${chalk.green('open')} - Open a workshop in editor`,
				value: 'open' as const,
				description: currentWorkshop
					? `Open ${currentWorkshop.title}`
					: 'Interactive workshop selection',
			},
			{
				name: `${chalk.green('list')} - List all workshops`,
				value: 'list' as const,
				description: 'List all added workshops',
			},
			{
				name: `${chalk.green('add')} - Add a workshop`,
				value: 'add' as const,
				description: 'Clone a workshop from epicweb-dev GitHub org',
			},
			{
				name: `${chalk.green('remove')} - Remove a workshop`,
				value: 'remove' as const,
				description: currentWorkshop
					? `Remove ${currentWorkshop.title}`
					: 'Interactive workshop selection',
			},
			{
				name: `${chalk.green('update')} - Update workshop`,
				value: 'update' as const,
				description: currentWorkshop
					? `Update ${currentWorkshop.title}`
					: 'Interactive workshop selection',
			},
			{
				name: `${chalk.green('warm')} - Warm caches`,
				value: 'warm' as const,
				description: currentWorkshop
					? `Warm ${currentWorkshop.title}`
					: 'Interactive workshop selection',
			},
			{
				name: `${chalk.green('config')} - View/update configuration`,
				value: 'config' as const,
				description: 'View or update workshop configuration',
			},
			{
				name: `${chalk.green('init')} - First-time setup`,
				value: 'init' as const,
				description: 'Initialize epicshop and start the tutorial',
			},
			{
				name: `${chalk.green('help')} - Show help`,
				value: 'help' as const,
				description: 'Display CLI help information',
			},
		]

		const allChoices: Array<{ name: string; value: string; description?: string; disabled?: boolean }> = currentWorkshop
			? [
					{
						name: chalk.gray(`─── Current: ${currentWorkshop.title} ───`),
						value: '',
						disabled: true,
					},
					...baseChoices,
				]
			: baseChoices

		const subcommand = await search({
			message: 'What would you like to do?',
			source: async (input) => {
				const choices = allChoices.filter((c) => !c.disabled)
				if (!input) {
					return choices
				}
				return matchSorter(choices, input, {
					keys: ['name', 'value', 'description'],
				})
			},
		})

		switch (subcommand) {
			case 'start': {
				const { detectCurrentWorkshop: detect, startWorkshop } = await import(
					'./commands/workshops.js'
				)
				const workshop = await detect()
				if (workshop) {
					// Inside a workshop, start it directly
					await import('./commands/migrate.js')
						.then(({ migrate }) => migrate())
						.catch(() => {})
					import('./commands/warm.js')
						.then(({ warm }) => warm({ silent: true }))
						.catch(() => {})
					const { start } = await import('./commands/start.js')
					const result = await start({})
					if (!result.success) process.exit(1)
				} else {
					const result = await startWorkshop({})
					if (!result.success) process.exit(1)
				}
				break
			}
			case 'open': {
				const { detectCurrentWorkshop: detect, openWorkshop } = await import(
					'./commands/workshops.js'
				)
				const workshop = await detect()
				const result = await openWorkshop({
					workshop: workshop?.repoName,
				})
				if (!result.success) process.exit(1)
				break
			}
			case 'list': {
				const { list } = await import('./commands/workshops.js')
				const result = await list({})
				if (!result.success) process.exit(1)
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
				if (!result.success) process.exit(1)
				break
			}
			case 'remove': {
				const { detectCurrentWorkshop: detect, remove } = await import(
					'./commands/workshops.js'
				)
				const workshop = await detect()
				const result = await remove({
					workshop: workshop?.repoName,
				})
				if (!result.success) process.exit(1)
				break
			}
			case 'update': {
				const { detectCurrentWorkshop: detect } = await import(
					'./commands/workshops.js'
				)
				const workshop = await detect()
				if (workshop) {
					const { update } = await import('./commands/update.js')
					const result = await update({})
					if (!result.success) process.exit(1)
				} else {
					// Need to select a workshop
					const { listWorkshops, getWorkshop } = await import(
						'@epic-web/workshop-utils/workshops.server'
					)
					const workshops = await listWorkshops()
					if (workshops.length === 0) {
						console.log(
							chalk.yellow(
								`No workshops found. Use 'epicshop add <repo-name>' to add one.`,
							),
						)
						process.exit(1)
					}
					const workshopChoices = workshops.map((w: { title: string; repoName: string; path: string }) => ({
						name: `${w.title} (${w.repoName})`,
						value: w.repoName,
						description: w.path,
					}))
					const selectedWorkshop = await search({
						message: 'Select a workshop to update:',
						source: async (input) => {
							if (!input) return workshopChoices
							return matchSorter(workshopChoices, input, {
								keys: ['name', 'value', 'description'],
							})
						},
					})
					const ws = await getWorkshop(selectedWorkshop)
					if (!ws) {
						console.error(chalk.red(`❌ Workshop not found`))
						process.exit(1)
					}
					const originalCwd = process.cwd()
					process.chdir(ws.path)
					try {
						const { update } = await import('./commands/update.js')
						const result = await update({})
						if (!result.success) process.exit(1)
					} finally {
						process.chdir(originalCwd)
					}
				}
				break
			}
			case 'warm': {
				const { detectCurrentWorkshop: detect } = await import(
					'./commands/workshops.js'
				)
				const workshop = await detect()
				if (workshop) {
					const { warm } = await import('./commands/warm.js')
					const result = await warm({})
					if (!result.success) process.exit(1)
				} else {
					// Need to select a workshop
					const { listWorkshops, getWorkshop } = await import(
						'@epic-web/workshop-utils/workshops.server'
					)
					const workshops = await listWorkshops()
					if (workshops.length === 0) {
						console.log(
							chalk.yellow(
								`No workshops found. Use 'epicshop add <repo-name>' to add one.`,
							),
						)
						process.exit(1)
					}
					const workshopChoices = workshops.map((w: { title: string; repoName: string; path: string }) => ({
						name: `${w.title} (${w.repoName})`,
						value: w.repoName,
						description: w.path,
					}))
					const selectedWorkshop = await search({
						message: 'Select a workshop to warm:',
						source: async (input) => {
							if (!input) return workshopChoices
							return matchSorter(workshopChoices, input, {
								keys: ['name', 'value', 'description'],
							})
						},
					})
					const ws = await getWorkshop(selectedWorkshop)
					if (!ws) {
						console.error(chalk.red(`❌ Workshop not found`))
						process.exit(1)
					}
					const originalCwd = process.cwd()
					process.chdir(ws.path)
					try {
						const { warm } = await import('./commands/warm.js')
						const result = await warm({})
						if (!result.success) process.exit(1)
					} finally {
						process.chdir(originalCwd)
					}
				}
				break
			}
			case 'config': {
				const { config } = await import('./commands/workshops.js')
				const result = await config({})
				if (!result.success) process.exit(1)
				break
			}
			case 'init': {
				const { onboarding } = await import('./commands/workshops.js')
				const result = await onboarding()
				if (!result.success) process.exit(1)
				break
			}
			case 'help': {
				cli.showHelp((helpText) => {
					console.log(formatHelp(helpText))
				})
				break
			}
		}
	}
} catch (error) {
	if ((error as Error).message === 'USER_QUIT') {
		process.exit(0)
	}
	console.error(chalk.red('❌ Error:'), error)
	process.exit(1)
}
