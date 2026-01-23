#!/usr/bin/env node

import '@epic-web/workshop-utils/init-env'
import chalk from 'chalk'
import { matchSorter } from 'match-sorter'
import yargs, { type ArgumentsCamelCase, type Argv } from 'yargs'
import { hideBin } from 'yargs/helpers'
import { assertCanPrompt } from './utils/cli-runtime.js'
import { initCliSentry } from './utils/sentry-cli.js'

// Check for --help on start command before yargs parses
// (yargs exits before command handler when help is requested)
const args = hideBin(process.argv)
const cliSentry = initCliSentry(args)
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
	.middleware((argv) => {
		cliSentry.setCommandContextFromArgv(argv)
	})
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
		'setup',
		'Install workshop dependencies (uses configured package manager)',
		(yargs: Argv) => {
			return yargs
				.option('silent', {
					alias: 's',
					type: 'boolean',
					description: 'Run without output logs',
					default: false,
				})
				.example('$0 setup', 'Install workshop dependencies')
		},
		async (argv: ArgumentsCamelCase<{ silent?: boolean }>) => {
			const { setup } = await import('./commands/setup.js')
			const result = await setup({ silent: argv.silent })
			if (!result.success) {
				process.exit(1)
			}
		},
	)
	.command(
		'add [repo-name] [destination]',
		'Add a workshop by cloning from epicweb-dev GitHub org',
		(yargs: Argv) => {
			return yargs
				.positional('repo-name', {
					describe:
						'Repository name from epicweb-dev org (optional, shows list if omitted). Use <repo>#<tag|branch|commit> to pin a ref.',
					type: 'string',
				})
				.positional('destination', {
					describe:
						'Optional directory to clone into (full path). If provided, this bypasses the configured repos directory.',
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
				.example(
					'$0 add react-fundamentals ~/Desktop/react-fundamentals',
					'Clone workshop to a specific destination directory',
				)
				.example(
					'$0 add react-fundamentals#v1.2.0',
					'Clone a workshop at a specific tag, branch, or commit',
				)
		},
		async (
			argv: ArgumentsCamelCase<{
				repoName?: string
				destination?: string
				directory?: string
				silent?: boolean
			}>,
		) => {
			const { add } = await import('./commands/workshops.js')
			const result = await add({
				repoName: argv.repoName,
				destination: argv.destination,
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
			const { findWorkshopRoot, remove } =
				await import('./commands/workshops.ts')

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
			const { findWorkshopRoot, openWorkshop } =
				await import('./commands/workshops.ts')

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
		'config [subcommand]',
		'View or update workshop configuration',
		(yargs: Argv) => {
			return yargs
				.positional('subcommand', {
					describe: 'Config subcommand (reset)',
					type: 'string',
					choices: ['reset', 'editor'],
				})
				.option('repos-dir', {
					type: 'string',
					description: 'Set the default directory for workshop repos',
				})
				.option('editor', {
					type: 'string',
					description: 'Set the preferred editor command',
				})
				.option('silent', {
					alias: 's',
					type: 'boolean',
					description: 'Run without output logs',
					default: false,
				})
				.example('$0 config', 'View current configuration')
				.example('$0 config reset', 'Delete config file and reset to defaults')
				.example('$0 config --repos-dir ~/epicweb', 'Set the repos directory')
				.example('$0 config editor', 'Choose a preferred editor')
				.example('$0 config --editor code', 'Set preferred editor to VS Code')
		},
		async (
			argv: ArgumentsCamelCase<{
				subcommand?: string
				reposDir?: string
				editor?: string
				silent?: boolean
			}>,
		) => {
			const { config } = await import('./commands/workshops.js')
			const result = await config({
				subcommand:
					argv.subcommand === 'reset'
						? 'reset'
						: argv.subcommand === 'editor'
							? 'editor'
							: undefined,
				reposDir: argv.reposDir,
				preferredEditor: argv.editor,
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
				const { listWorkshops, getWorkshop } =
					await import('@epic-web/workshop-utils/workshops.server')
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

				assertCanPrompt({
					reason: 'select a workshop to update',
					hints: [
						'Run from inside a workshop directory: (cd <workshop> && npx epicshop update)',
						'Or run in a TTY to select interactively.',
					],
				})
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
				const { listWorkshops, getWorkshop } =
					await import('@epic-web/workshop-utils/workshops.server')
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

				assertCanPrompt({
					reason: 'select a workshop to warm',
					hints: [
						'Run from inside a workshop directory: (cd <workshop> && npx epicshop warm)',
						'Or run in a TTY to select interactively.',
					],
				})
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
		'cleanup',
		'Clean up local epicshop data',
		(yargs: Argv) => {
			return yargs
				.option('targets', {
					alias: 't',
					type: 'array',
					choices: [
						'caches',
						'offline-videos',
						'preferences',
						'auth',
						'config',
					],
					description:
						'Cleanup targets (repeatable): caches, offline-videos, preferences, auth, config',
				})
				.option('workshops', {
					type: 'array',
					description: 'Workshops to clean (repeatable, by repo name or path)',
				})
				.option('workshop-actions', {
					type: 'array',
					choices: ['files', 'caches', 'offline-videos'],
					description: 'Cleanup actions for selected workshops (repeatable)',
				})
				.option('silent', {
					alias: 's',
					type: 'boolean',
					description: 'Run without output logs',
					default: false,
				})
				.option('force', {
					alias: 'f',
					type: 'boolean',
					description: 'Skip the confirmation prompt',
					default: false,
				})
				.example(
					'$0 cleanup',
					'Pick cleanup targets interactively (multi-select)',
				)
				.example(
					'$0 cleanup --targets caches --targets preferences --force',
					'Clean selected targets without prompting',
				)
				.example(
					'$0 cleanup --workshops full-stack-foundations --workshop-actions caches --force',
					'Clean caches for a specific workshop',
				)
		},
		async (
			argv: ArgumentsCamelCase<{
				silent?: boolean
				force?: boolean
				targets?: Array<string>
				workshops?: Array<string>
				workshopActions?: Array<string>
			}>,
		) => {
			const { cleanup } = await import('./commands/cleanup.js')
			const result = await cleanup({
				silent: argv.silent,
				force: argv.force,
				targets: argv.targets as Array<
					'caches' | 'offline-videos' | 'preferences' | 'auth' | 'config'
				>,
				workshops: argv.workshops,
				workshopTargets: argv.workshopActions as Array<
					'files' | 'caches' | 'offline-videos'
				>,
			})
			if (!result.success) {
				process.exit(1)
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

				assertCanPrompt({
					reason: 'choose an auth subcommand',
					hints: [
						'Provide the subcommand: npx epicshop auth status|login|logout',
						'Examples: npx epicshop auth status, npx epicshop auth login epicweb.dev, npx epicshop auth logout epicreact',
					],
				})
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

			if (!argv.subcommand) {
				cliSentry.setCommandContext({
					command: 'auth',
					subcommand,
				})
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
	.command(
		'playground [subcommand] [target]',
		'Manage the playground environment (context-aware)',
		(yargs: Argv) => {
			return yargs
				.positional('subcommand', {
					describe: 'Playground subcommand (show, set, saved)',
					type: 'string',
					choices: ['show', 'set', 'saved'],
				})
				.positional('target', {
					describe:
						'Target exercise step (e.g., 1.2.problem) or saved playground id',
					type: 'string',
				})
				.option('exercise', {
					alias: 'e',
					type: 'number',
					description: 'Exercise number',
				})
				.option('step', {
					type: 'number',
					description: 'Step number',
				})
				.option('type', {
					alias: 't',
					type: 'string',
					choices: ['problem', 'solution'],
					description: 'App type (problem or solution)',
				})
				.option('list', {
					type: 'boolean',
					description: 'List saved playgrounds (saved subcommand)',
					default: false,
				})
				.option('latest', {
					type: 'boolean',
					description:
						'Use the most recent saved playground (saved subcommand)',
					default: false,
				})
				.option('json', {
					type: 'boolean',
					description: 'Output saved playgrounds as JSON (saved list)',
					default: false,
				})
				.option('silent', {
					alias: 's',
					type: 'boolean',
					description: 'Run without output logs',
					default: false,
				})
				.example('$0 playground', 'Show current playground status')
				.example('$0 playground show', 'Show current playground status')
				.example(
					'$0 playground set',
					'Select a playground app to set (defaults to next step)',
				)
				.example('$0 playground set 1.2.problem', 'Set to specific step')
				.example('$0 playground set --exercise 1 --step 2', 'Set with options')
				.example(
					'$0 playground saved',
					'Interactively select a saved playground',
				)
				.example('$0 playground saved list', 'List saved playgrounds')
				.example(
					'$0 playground saved 2026.01.18_11.12.00_01.01.problem',
					'Set playground from a saved copy',
				)
		},
		async (
			argv: ArgumentsCamelCase<{
				subcommand?: string
				target?: string
				exercise?: number
				step?: number
				type?: string
				list?: boolean
				latest?: boolean
				json?: boolean
				silent?: boolean
			}>,
		) => {
			const { findWorkshopRoot } = await import('./commands/workshops.js')
			const workshopRoot = await findWorkshopRoot()

			if (!workshopRoot) {
				console.error(
					chalk.red(
						'❌ Not inside a workshop directory. Please cd into a workshop first.',
					),
				)
				process.exit(1)
			}

			const originalCwd = process.cwd()
			process.chdir(workshopRoot)

			try {
				const {
					listSavedPlaygrounds,
					parseAppIdentifier,
					selectAndSet,
					selectAndSetSavedPlayground,
					set,
					setSavedPlayground,
					show,
				} = await import('./commands/playground.js')

				const subcommand = argv.subcommand || 'show'

				if (subcommand === 'show') {
					const result = await show({ silent: argv.silent })
					if (!result.success) process.exit(1)
				} else if (subcommand === 'set') {
					// Parse target if provided (e.g., "1.2.problem")
					let exerciseNumber = argv.exercise
					let stepNumber = argv.step
					let type = argv.type as 'problem' | 'solution' | undefined

					if (argv.target) {
						const parsed = parseAppIdentifier(argv.target)
						// Validate that the target was parseable - at least exercise number should be found
						if (parsed.exerciseNumber === undefined) {
							console.error(
								chalk.red(
									`❌ Invalid target format: "${argv.target}". Expected format like "1.2.problem" or "01.02.solution"`,
								),
							)
							process.exit(1)
						}
						exerciseNumber = parsed.exerciseNumber ?? exerciseNumber
						stepNumber = parsed.stepNumber ?? stepNumber
						type = parsed.type ?? type
					}

					// If no specific target, prompt for selection
					if (!exerciseNumber && !stepNumber && !type) {
						const result = await selectAndSet({ silent: argv.silent })
						if (!result.success) process.exit(1)
					} else {
						const result = await set({
							exerciseNumber,
							stepNumber,
							type,
							silent: argv.silent,
						})
						if (!result.success) process.exit(1)
					}
				} else if (subcommand === 'saved') {
					const shouldList = argv.list || argv.target === 'list' || argv.json
					if (shouldList) {
						const result = await listSavedPlaygrounds({
							silent: argv.silent,
							json: argv.json,
						})
						if (!result.success) process.exit(1)
						return
					}

					if (argv.latest) {
						const result = await setSavedPlayground({
							latest: true,
							silent: argv.silent,
						})
						if (!result.success) process.exit(1)
						return
					}

					if (argv.target) {
						const result = await setSavedPlayground({
							savedPlaygroundId: argv.target,
							silent: argv.silent,
						})
						if (!result.success) process.exit(1)
						return
					}

					const result = await selectAndSetSavedPlayground({
						silent: argv.silent,
					})
					if (!result.success) process.exit(1)
				} else {
					console.error(chalk.red(`❌ Unknown subcommand: ${subcommand}`))
					process.exit(1)
				}
			} finally {
				process.chdir(originalCwd)
			}
		},
	)
	.command(
		'progress [subcommand] [lesson-slug]',
		'View and manage your progress (context-aware)',
		(yargs: Argv) => {
			return yargs
				.positional('subcommand', {
					describe: 'Progress subcommand (show, update)',
					type: 'string',
					choices: ['show', 'update'],
				})
				.positional('lesson-slug', {
					describe: 'Lesson slug to update (for update subcommand)',
					type: 'string',
				})
				.option('complete', {
					alias: 'c',
					type: 'boolean',
					description: 'Mark as complete (default: true)',
					default: true,
				})
				.option('incomplete', {
					alias: 'i',
					type: 'boolean',
					description: 'Mark as incomplete',
					default: false,
				})
				.option('json', {
					type: 'boolean',
					description: 'Output as JSON',
					default: false,
				})
				.option('silent', {
					alias: 's',
					type: 'boolean',
					description: 'Run without output logs',
					default: false,
				})
				.example('$0 progress', 'Show progress for current workshop')
				.example('$0 progress show', 'Show progress for current workshop')
				.example('$0 progress show --json', 'Output progress as JSON')
				.example('$0 progress update 01-01-problem', 'Mark lesson as complete')
				.example(
					'$0 progress update 01-01-problem --incomplete',
					'Mark lesson as incomplete',
				)
		},
		async (
			argv: ArgumentsCamelCase<{
				subcommand?: string
				lessonSlug?: string
				complete?: boolean
				incomplete?: boolean
				json?: boolean
				silent?: boolean
			}>,
		) => {
			const { findWorkshopRoot } = await import('./commands/workshops.js')
			const workshopRoot = await findWorkshopRoot()

			if (!workshopRoot) {
				console.error(
					chalk.red(
						'❌ Not inside a workshop directory. Please cd into a workshop first.',
					),
				)
				process.exit(1)
			}

			const originalCwd = process.cwd()
			process.chdir(workshopRoot)

			try {
				const { show, update } = await import('./commands/progress.js')

				const subcommand = argv.subcommand || 'show'

				if (subcommand === 'show') {
					const result = await show({
						silent: argv.silent,
						json: argv.json,
					})
					if (!result.success) process.exit(1)
				} else if (subcommand === 'update') {
					// --incomplete takes precedence, otherwise use --complete value
					const complete = argv.incomplete ? false : argv.complete
					const result = await update({
						lessonSlug: argv.lessonSlug,
						complete,
						silent: argv.silent,
					})
					if (!result.success) process.exit(1)
				} else {
					console.error(chalk.red(`❌ Unknown subcommand: ${subcommand}`))
					process.exit(1)
				}
			} finally {
				process.chdir(originalCwd)
			}
		},
	)
	.command(
		'diff [app1] [app2]',
		'Show differences between apps or playground vs solution (context-aware)',
		(yargs: Argv) => {
			return yargs
				.positional('app1', {
					describe:
						'First app identifier (e.g., 01.02.problem). If omitted, prompts with playground vs solution as the default.',
					type: 'string',
				})
				.positional('app2', {
					describe: 'Second app identifier (e.g., 01.02.solution)',
					type: 'string',
				})
				.option('silent', {
					alias: 's',
					type: 'boolean',
					description: 'Run without output logs',
					default: false,
				})
				.example(
					'$0 diff',
					'Select apps to diff (defaults to playground vs solution)',
				)
				.example(
					'$0 diff 01.02.problem 01.02.solution',
					'Show diff between two apps',
				)
		},
		async (
			argv: ArgumentsCamelCase<{
				app1?: string
				app2?: string
				silent?: boolean
			}>,
		) => {
			const { findWorkshopRoot } = await import('./commands/workshops.js')
			const workshopRoot = await findWorkshopRoot()

			if (!workshopRoot) {
				console.error(
					chalk.red(
						'❌ Not inside a workshop directory. Please cd into a workshop first.',
					),
				)
				process.exit(1)
			}

			const originalCwd = process.cwd()
			process.chdir(workshopRoot)

			try {
				const { showDiffBetweenApps, selectAndShowDiff } =
					await import('./commands/diff.js')

				if (argv.app1 && argv.app2) {
					const result = await showDiffBetweenApps({
						app1: argv.app1,
						app2: argv.app2,
						silent: argv.silent,
					})
					if (!result.success) process.exit(1)
				} else if (argv.app1 && !argv.app2) {
					console.error(
						chalk.red('❌ When providing app1, app2 is also required'),
					)
					process.exit(1)
				} else {
					const result = await selectAndShowDiff({ silent: argv.silent })
					if (!result.success) process.exit(1)
				}
			} finally {
				process.chdir(originalCwd)
			}
		},
	)
	.command(
		'exercises [exercise] [step]',
		'List exercises or show exercise details (context-aware)',
		(yargs: Argv) => {
			return yargs
				.positional('exercise', {
					describe: 'Exercise number to show details for (e.g., 1 or 01)',
					type: 'string',
				})
				.positional('step', {
					describe: 'Step number to show details for (e.g., 2 or 02)',
					type: 'string',
				})
				.option('json', {
					type: 'boolean',
					description: 'Output as JSON',
					default: false,
				})
				.option('silent', {
					alias: 's',
					type: 'boolean',
					description: 'Run without output logs',
					default: false,
				})
				.example('$0 exercises', 'List all exercises with progress')
				.example('$0 exercises 1', 'Show details for exercise 1')
				.example('$0 exercises 1 2', 'Show details for exercise 1 step 2')
				.example('$0 exercises --json', 'Output exercises as JSON')
		},
		async (
			argv: ArgumentsCamelCase<{
				exercise?: string
				step?: string
				json?: boolean
				silent?: boolean
			}>,
		) => {
			const { findWorkshopRoot } = await import('./commands/workshops.js')
			const workshopRoot = await findWorkshopRoot()

			if (!workshopRoot) {
				console.error(
					chalk.red(
						'❌ Not inside a workshop directory. Please cd into a workshop first.',
					),
				)
				process.exit(1)
			}

			const originalCwd = process.cwd()
			process.chdir(workshopRoot)

			try {
				const { list, showExercise } = await import('./commands/exercises.js')

				if (argv.exercise) {
					const exerciseNumber = parseInt(argv.exercise, 10)
					if (isNaN(exerciseNumber)) {
						console.error(
							chalk.red(
								`❌ Invalid exercise number: "${argv.exercise}". Expected a number.`,
							),
						)
						process.exit(1)
					}
					const stepNumber = argv.step ? parseInt(argv.step, 10) : undefined
					if (stepNumber !== undefined && isNaN(stepNumber)) {
						console.error(
							chalk.red(
								`❌ Invalid step number: "${argv.step}". Expected a number.`,
							),
						)
						process.exit(1)
					}
					const result = await showExercise({
						exerciseNumber,
						stepNumber,
						json: argv.json,
						silent: argv.silent,
					})
					if (!result.success) process.exit(1)
				} else {
					const result = await list({
						json: argv.json,
						silent: argv.silent,
					})
					if (!result.success) process.exit(1)
				}
			} finally {
				process.chdir(originalCwd)
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

		assertCanPrompt({
			reason: 'choose a command',
			hints: [
				'Run with an explicit command: npx epicshop <command> [options]',
				'Example (CI friendly): CI=true npx --yes epicshop@latest add react-fundamentals',
				'For help: npx epicshop --help',
			],
		})
		const { search } = await import('@inquirer/prompts')

		// Build choices - workshop-specific commands only show when inside a workshop
		const baseChoices: Array<{
			name: string
			value: string
			description: string
		}> = []

		// Always-available commands
		baseChoices.push(
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
		)

		// Workshop-specific commands (only when inside a workshop)
		if (workshopTitle) {
			baseChoices.push(
				{
					name: `${chalk.green('exercises')} - List exercises`,
					value: 'exercises' as const,
					description: `View exercises and progress in ${workshopTitle}`,
				},
				{
					name: `${chalk.green('playground')} - Manage playground`,
					value: 'playground' as const,
					description: 'View or set the current playground',
				},
				{
					name: `${chalk.green('progress')} - View/update progress`,
					value: 'progress' as const,
					description: 'View or update your learning progress',
				},
				{
					name: `${chalk.green('diff')} - Show differences`,
					value: 'diff' as const,
					description: 'Show diff between playground and solution',
				},
			)
		}

		// More always-available commands
		baseChoices.push(
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
				name: `${chalk.green('setup')} - Install dependencies`,
				value: 'setup' as const,
				description: 'Install workshop dependencies (uses configured manager)',
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
				name: `${chalk.green('cleanup')} - Cleanup data`,
				value: 'cleanup' as const,
				description: 'Select what to delete (workshops, caches, prefs, auth)',
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
		)

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
		cliSentry.setCommandContext({ command: subcommand, interactive: true })

		switch (subcommand) {
			case 'start': {
				const { findWorkshopRoot, startWorkshop } =
					await import('./commands/workshops.ts')
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
				const { findWorkshopRoot, openWorkshop } =
					await import('./commands/workshops.ts')
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
			case 'setup': {
				const { setup } = await import('./commands/setup.js')
				const result = await setup({})
				if (!result.success) process.exit(1)
				break
			}
			case 'remove': {
				const { findWorkshopRoot, remove } =
					await import('./commands/workshops.ts')
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
					const { listWorkshops, getWorkshop } =
						await import('@epic-web/workshop-utils/workshops.server')
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
					const { listWorkshops, getWorkshop } =
						await import('@epic-web/workshop-utils/workshops.server')
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
			case 'cleanup': {
				try {
					const { cleanup } = await import('./commands/cleanup.js')
					const result = await cleanup({})
					if (!result.success) process.exit(1)
				} catch (error) {
					if ((error as Error).message === 'USER_QUIT') {
						process.exit(0)
					}
					throw error
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

				// We already prompted to choose a command above; this is just another prompt.
				// Guard anyway so CI/non-TTY fails with a clear message.
				assertCanPrompt({
					reason: 'choose an auth subcommand',
					hints: [
						'Provide the subcommand: npx epicshop auth status|login|logout',
						'Example: npx epicshop auth status',
					],
				})
				const authSubcommand = await authSearch({
					message: 'What would you like to do?',
					source: async (input) => {
						if (!input) return authChoices
						return matchSorter(authChoices, input, {
							keys: ['name', 'value', 'description'],
						})
					},
				})
				cliSentry.setCommandContext({
					command: 'auth',
					subcommand: authSubcommand,
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
			case 'exercises': {
				const { findWorkshopRoot } = await import('./commands/workshops.js')
				const wsRoot = await findWorkshopRoot()
				if (!wsRoot) {
					console.error(chalk.red('❌ Not inside a workshop directory'))
					process.exit(1)
				}
				const originalCwd = process.cwd()
				process.chdir(wsRoot)
				try {
					const { list: listExercises } =
						await import('./commands/exercises.js')
					const result = await listExercises({})
					if (!result.success) process.exit(1)
				} finally {
					process.chdir(originalCwd)
				}
				break
			}
			case 'playground': {
				const { findWorkshopRoot } = await import('./commands/workshops.js')
				const wsRoot = await findWorkshopRoot()
				if (!wsRoot) {
					console.error(chalk.red('❌ Not inside a workshop directory'))
					process.exit(1)
				}
				const originalCwd = process.cwd()
				process.chdir(wsRoot)
				try {
					const { show: showPlayground } =
						await import('./commands/playground.js')
					const result = await showPlayground({})
					if (!result.success) process.exit(1)
				} finally {
					process.chdir(originalCwd)
				}
				break
			}
			case 'progress': {
				const { findWorkshopRoot } = await import('./commands/workshops.js')
				const wsRoot = await findWorkshopRoot()
				if (!wsRoot) {
					console.error(chalk.red('❌ Not inside a workshop directory'))
					process.exit(1)
				}
				const originalCwd = process.cwd()
				process.chdir(wsRoot)
				try {
					const { show: showProgress } = await import('./commands/progress.js')
					const result = await showProgress({})
					if (!result.success) process.exit(1)
				} finally {
					process.chdir(originalCwd)
				}
				break
			}
			case 'diff': {
				const { findWorkshopRoot } = await import('./commands/workshops.js')
				const wsRoot = await findWorkshopRoot()
				if (!wsRoot) {
					console.error(chalk.red('❌ Not inside a workshop directory'))
					process.exit(1)
				}
				const originalCwd = process.cwd()
				process.chdir(wsRoot)
				try {
					const { selectAndShowDiff } = await import('./commands/diff.js')
					const result = await selectAndShowDiff({})
					if (!result.success) process.exit(1)
				} finally {
					process.chdir(originalCwd)
				}
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
	cliSentry.captureException(error)
	await cliSentry.flush()
	console.error(chalk.red('❌ Error:'), error)
	process.exit(1)
}
