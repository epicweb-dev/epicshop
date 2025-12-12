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
				.example('$0 start full-stack-foundations', 'Start a specific workshop')
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
			// If a specific workshop is requested, start it from managed workshops
			if (argv.workshop) {
				const { startWorkshop } = await import('./commands/workshops.js')
				const result = await startWorkshop({
					workshop: argv.workshop,
					silent: argv.silent,
				})
				if (!result.success) {
					process.exit(1)
				}
				return
			}

			// Check if we're inside any workshop directory (walk up to find package.json with epicshop)
			const { findWorkshopRoot } = await import('./commands/workshops.js')
			const workshopRoot = await findWorkshopRoot()

			if (workshopRoot) {
				// We're inside a workshop directory, start from that root
				const originalCwd = process.cwd()
				process.chdir(workshopRoot)

				try {
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
				} finally {
					process.chdir(originalCwd)
				}
			} else {
				// Not inside a workshop, show selection from managed workshops
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
		'add [repo-name]',
		'Add a workshop by cloning from epicweb-dev GitHub org',
		(yargs: Argv) => {
			return yargs
				.positional('repo-name', {
					describe:
						'Repository name from epicweb-dev org (optional, shows list if omitted)',
					type: 'string',
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
				.example('$0 add', 'Show available workshops to add')
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
				repoName?: string
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
			const { findWorkshopRoot, remove } = await import(
				'./commands/workshops.js'
			)

			let workshopToRemove = argv.workshop

			// If no workshop specified, check if we're inside a workshop directory
			if (!workshopToRemove) {
				const workshopRoot = await findWorkshopRoot()
				if (workshopRoot) {
					// Pass the path directly - remove will handle it
					workshopToRemove = workshopRoot
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
				.example('$0 open full-stack-foundations', 'Open a specific workshop')
		},
		async (
			argv: ArgumentsCamelCase<{
				workshop?: string
				silent?: boolean
			}>,
		) => {
			const { findWorkshopRoot, openWorkshop } = await import(
				'./commands/workshops.js'
			)

			let workshopToOpen = argv.workshop

			// If no workshop specified, check if we're inside a workshop directory
			if (!workshopToOpen) {
				const workshopRoot = await findWorkshopRoot()
				if (workshopRoot) {
					// Pass the path directly - openWorkshop will handle it
					workshopToOpen = workshopRoot
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
			// Check if we're inside any workshop directory
			const { findWorkshopRoot } = await import('./commands/workshops.js')
			const workshopRoot = await findWorkshopRoot()

			if (workshopRoot) {
				// Inside a workshop, run update on it
				const originalCwd = process.cwd()
				process.chdir(workshopRoot)

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
				} catch (error) {
					if (!argv.silent) {
						console.error(chalk.red('❌ Update failed:'), error)
					}
					process.exit(1)
				} finally {
					process.chdir(originalCwd)
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

				const allChoices = workshops.map(
					(w: { title: string; repoName: string; path: string }) => ({
						name: `${w.title} (${w.repoName})`,
						value: w.repoName,
						description: w.path,
					}),
				)

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
			// Check if we're inside any workshop directory
			const { findWorkshopRoot } = await import('./commands/workshops.js')
			const workshopRoot = await findWorkshopRoot()

			if (workshopRoot) {
				// Inside a workshop, warm it
				const originalCwd = process.cwd()
				process.chdir(workshopRoot)

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
				} catch (error) {
					if (!argv.silent) {
						console.error(chalk.red('❌ Warmup failed:'), error)
					}
					process.exit(1)
				} finally {
					process.chdir(originalCwd)
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

				const allChoices = workshops.map(
					(w: { title: string; repoName: string; path: string }) => ({
						name: `${w.title} (${w.repoName})`,
						value: w.repoName,
						description: w.path,
					}),
				)

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
	.command(
		'auth [subcommand] [domain]',
		'Manage authentication for Epic domains (epicweb.dev, epicreact.dev, epicai.pro)',
		(yargs: Argv) => {
			return yargs
				.positional('subcommand', {
					describe: 'Auth subcommand (status, login, logout)',
					type: 'string',
					choices: ['status', 'login', 'logout'],
				})
				.positional('domain', {
					describe:
						'Domain to authenticate with (e.g., epicweb.dev, epicreact, epicai)',
					type: 'string',
				})
				.option('silent', {
					alias: 's',
					type: 'boolean',
					description: 'Run without output logs',
					default: false,
				})
				.example('$0 auth', 'Show auth subcommand menu')
				.example('$0 auth status', 'Show login status for all domains')
				.example('$0 auth login', 'Login to a domain (interactive)')
				.example('$0 auth login epicweb.dev', 'Login to EpicWeb.dev')
				.example('$0 auth logout epicreact', 'Logout from EpicReact.dev')
		},
		async (
			argv: ArgumentsCamelCase<{
				subcommand?: string
				domain?: string
				silent?: boolean
			}>,
		) => {
			const { status, login, logout } = await import('./commands/auth.js')

			let subcommand = argv.subcommand

			if (!subcommand) {
				if (argv.silent) {
					console.error(
						chalk.red(
							'❌ Subcommand required in silent mode (status, login, logout)',
						),
					)
					process.exit(1)
				}

				const { search } = await import('@inquirer/prompts')

				const authChoices = [
					{
						name: `${chalk.green('status')} - Show login status`,
						value: 'status' as const,
						description: 'Show login status for all Epic domains',
					},
					{
						name: `${chalk.green('login')} - Log in to a domain`,
						value: 'login' as const,
						description: 'Log in to EpicWeb.dev, EpicReact.dev, or EpicAI.pro',
					},
					{
						name: `${chalk.green('logout')} - Log out from a domain`,
						value: 'logout' as const,
						description: 'Log out from an Epic domain',
					},
				]

				try {
					subcommand = await search({
						message: 'What would you like to do?',
						source: async (input) => {
							if (!input) return authChoices
							return matchSorter(authChoices, input, {
								keys: ['name', 'value', 'description'],
							})
						},
					})
				} catch (error) {
					if ((error as Error).message === 'USER_QUIT') {
						process.exit(0)
					}
					throw error
				}
			}

			let result: { success: boolean }

			switch (subcommand) {
				case 'status':
					result = await status({ silent: argv.silent })
					break
				case 'login':
					result = await login({ domain: argv.domain, silent: argv.silent })
					break
				case 'logout':
					result = await logout({ domain: argv.domain, silent: argv.silent })
					break
				default:
					console.error(chalk.red(`❌ Unknown auth subcommand: ${subcommand}`))
					process.exit(1)
			}

			if (!result.success) {
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
	await cli.parse()

	// If no command was provided, show command chooser
	// Only trigger when args is truly empty - any arg means a command was attempted
	if (args.length === 0) {
		// Check if we're inside a workshop first
		const { findWorkshopRoot } = await import('./commands/workshops.js')
		const workshopRoot = await findWorkshopRoot()

		// Get workshop title if we're inside one
		let workshopTitle: string | null = null
		if (workshopRoot) {
			try {
				const fs = await import('node:fs')
				const path = await import('node:path')
				const pkgPath = path.join(workshopRoot, 'package.json')
				const pkg = JSON.parse(
					await fs.promises.readFile(pkgPath, 'utf-8'),
				) as {
					epicshop?: { title?: string }
				}
				workshopTitle = pkg.epicshop?.title || path.basename(workshopRoot)
			} catch {
				// Use path.basename for cross-platform compatibility (Windows uses backslashes)
				const path = await import('node:path')
				workshopTitle = path.basename(workshopRoot) || 'current workshop'
			}
		}

		const { search } = await import('@inquirer/prompts')

		const baseChoices = [
			{
				name: `${chalk.green('start')} - Start a workshop`,
				value: 'start' as const,
				description: workshopTitle
					? `Start ${workshopTitle}`
					: 'Select a workshop to start',
			},
			{
				name: `${chalk.green('open')} - Open a workshop in editor`,
				value: 'open' as const,
				description: workshopTitle
					? `Open ${workshopTitle}`
					: 'Select a workshop to open',
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
				description: workshopTitle
					? `Remove ${workshopTitle}`
					: 'Select a workshop to remove',
			},
			{
				name: `${chalk.green('update')} - Update workshop`,
				value: 'update' as const,
				description: workshopTitle
					? `Update ${workshopTitle}`
					: 'Select a workshop to update',
			},
			{
				name: `${chalk.green('warm')} - Warm caches`,
				value: 'warm' as const,
				description: workshopTitle
					? `Warm the cache for ${workshopTitle}`
					: 'Select a workshop to warm the cache for',
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
				name: `${chalk.green('auth')} - Manage authentication`,
				value: 'auth' as const,
				description: 'Login/logout from EpicWeb.dev, EpicReact.dev, EpicAI.pro',
			},
			{
				name: `${chalk.green('help')} - Show help`,
				value: 'help' as const,
				description: 'Display CLI help information',
			},
		]

		const subcommand = await search({
			message: workshopTitle
				? `What would you like to do? ${chalk.gray(`(in ${workshopTitle})`)}`
				: 'What would you like to do?',
			source: async (input) => {
				if (!input) {
					return baseChoices
				}
				return matchSorter(baseChoices, input, {
					keys: ['name', 'value', 'description'],
				})
			},
		})

		switch (subcommand) {
			case 'start': {
				const { findWorkshopRoot, startWorkshop } = await import(
					'./commands/workshops.js'
				)
				const wsRoot = await findWorkshopRoot()
				if (wsRoot) {
					// Inside a workshop, start it directly
					const originalCwd = process.cwd()
					process.chdir(wsRoot)
					try {
						await import('./commands/migrate.js')
							.then(({ migrate }) => migrate())
							.catch(() => {})
						import('./commands/warm.js')
							.then(({ warm }) => warm({ silent: true }))
							.catch(() => {})
						const { start } = await import('./commands/start.js')
						const result = await start({})
						if (!result.success) process.exit(1)
					} finally {
						process.chdir(originalCwd)
					}
				} else {
					const result = await startWorkshop({})
					if (!result.success) process.exit(1)
				}
				break
			}
			case 'open': {
				const { findWorkshopRoot, openWorkshop } = await import(
					'./commands/workshops.js'
				)
				const workshopRoot = await findWorkshopRoot()
				const result = await openWorkshop({
					workshop: workshopRoot || undefined,
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
				const { add } = await import('./commands/workshops.js')
				const result = await add({})
				if (!result.success) process.exit(1)
				break
			}
			case 'remove': {
				const { findWorkshopRoot, remove } = await import(
					'./commands/workshops.js'
				)
				const workshopRoot = await findWorkshopRoot()
				const result = await remove({
					workshop: workshopRoot || undefined,
				})
				if (!result.success) process.exit(1)
				break
			}
			case 'update': {
				const { findWorkshopRoot } = await import('./commands/workshops.js')
				const wsRoot = await findWorkshopRoot()
				if (wsRoot) {
					const originalCwd = process.cwd()
					process.chdir(wsRoot)
					try {
						const { update } = await import('./commands/update.js')
						const result = await update({})
						if (!result.success) process.exit(1)
					} finally {
						process.chdir(originalCwd)
					}
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
					const workshopChoices = workshops.map(
						(w: { title: string; repoName: string; path: string }) => ({
							name: `${w.title} (${w.repoName})`,
							value: w.repoName,
							description: w.path,
						}),
					)
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
				const { findWorkshopRoot } = await import('./commands/workshops.js')
				const wsRoot = await findWorkshopRoot()
				if (wsRoot) {
					const originalCwd = process.cwd()
					process.chdir(wsRoot)
					try {
						const { warm } = await import('./commands/warm.js')
						const result = await warm({})
						if (!result.success) process.exit(1)
					} finally {
						process.chdir(originalCwd)
					}
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
					const workshopChoices = workshops.map(
						(w: { title: string; repoName: string; path: string }) => ({
							name: `${w.title} (${w.repoName})`,
							value: w.repoName,
							description: w.path,
						}),
					)
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
			case 'auth': {
				const { status, login, logout } = await import('./commands/auth.js')
				const { search: authSearch } = await import('@inquirer/prompts')

				const authChoices = [
					{
						name: `${chalk.green('status')} - Show login status`,
						value: 'status' as const,
						description: 'Show login status for all Epic domains',
					},
					{
						name: `${chalk.green('login')} - Log in to a domain`,
						value: 'login' as const,
						description: 'Log in to EpicWeb.dev, EpicReact.dev, or EpicAI.pro',
					},
					{
						name: `${chalk.green('logout')} - Log out from a domain`,
						value: 'logout' as const,
						description: 'Log out from an Epic domain',
					},
				]

				const authSubcommand = await authSearch({
					message: 'What would you like to do?',
					source: async (input) => {
						if (!input) return authChoices
						return matchSorter(authChoices, input, {
							keys: ['name', 'value', 'description'],
						})
					},
				})

				let authResult: { success: boolean }
				switch (authSubcommand) {
					case 'status':
						authResult = await status({})
						break
					case 'login':
						authResult = await login({})
						break
					case 'logout':
						authResult = await logout({})
						break
					default:
						process.exit(1)
				}
				if (!authResult.success) process.exit(1)
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
