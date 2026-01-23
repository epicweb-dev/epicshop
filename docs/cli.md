# epicshop CLI Documentation

The epicshop CLI provides commands to manage and run Epic workshops. It's
designed to help you start workshops, update them to the latest version, and
warm up caches for better performance.

The CLI can be used both as a command-line tool and programmatically via ESM
imports.

## Installation

The CLI is typically installed as part of the epicshop workshop setup. If you
need to install it separately:

```bash
npm install -g epicshop
```

## Context-Aware Behavior

Many commands in the epicshop CLI are **context-aware**. This means they
automatically detect if you're inside a workshop directory and act accordingly:

- **Inside a workshop directory**: Commands operate on that workshop
- **Outside a workshop directory**: Commands show an interactive selection of
  your managed workshops

This makes the CLI intuitive to use - just `cd` into a workshop and run commands
without needing to specify which workshop you mean.

## Commands

### `start` (default command)

Start a workshop. Context-aware: if inside a workshop, starts it; otherwise
shows interactive selection.

```bash
epicshop start [workshop] [options]
# or simply
epicshop [options]
```

#### Options

- `--verbose, -v` - Show verbose output (default: false)
- `--silent, -s` - Run without output logs (default: false)
- `--app-location <path>` - Path to the workshop app directory

#### Examples

```bash
# Inside a workshop directory - start that workshop
epicshop start

# Outside a workshop - select from your workshops
epicshop start

# Start a specific workshop by name
epicshop start full-stack-foundations

# Start with verbose logging
epicshop start --verbose

# Start with a custom app location
epicshop start --app-location /path/to/workshop-app
```

#### Features

- **Interactive Updates**: Press `u` to check for and apply updates while the
  server is running
- **Update Dismissal**: Press `d` to dismiss update notifications
- **Auto-restart**: Automatically restarts the server after updates
- **Port Management**: Automatically finds available ports
- **Environment Detection**: Detects production vs development environments

#### App Location Resolution

When inside a workshop, the CLI will look for the workshop app in the following
order:

1. `--app-location` command line argument
2. `EPICSHOP_APP_LOCATION` environment variable
3. Global installation (`npm install -g @epic-web/workshop-app`)
4. Local `node_modules/@epic-web/workshop-app`

### `init`

Initialize epicshop for first-time users. This command runs an interactive setup
wizard that:

1. Welcomes the user and explains what epicshop does
2. Prompts for a workshop storage directory (with a recommended default)
3. Offers to authenticate with Epic React, Epic Web, and Epic AI (optional)
4. Shows a list of workshops you can set up and lets you pick which to
   clone/setup (optional)
5. Clones and sets up the `epicshop-tutorial` repository
6. Starts the tutorial workshop

```bash
epicshop init
```

#### Examples

```bash
# Run the first-time setup wizard
epicshop init
```

### `setup`

Install workshop dependencies in the current directory. **Must be run from
within a workshop directory** (a directory containing a `package.json` file).

This command automatically detects and uses your package manager (npm, pnpm,
yarn, or bun) based on how you invoked epicshop. For example, if you run
`pnpm dlx epicshop setup`, it will use pnpm for the install.

**Note**: You typically don't need to run this command manually. The `add`
command automatically runs `setup` after cloning a workshop repository.

```bash
epicshop setup [options]
```

#### Options

- `--silent, -s` - Run without output logs (default: false)

#### Examples

```bash
# Install workshop dependencies (uses pkgmgr to detect your package manager)
cd ~/epicweb-workshops/full-stack-foundations
epicshop setup

# Install dependencies silently
epicshop setup --silent

# If you run with pnpm dlx, it uses pnpm; if you run with bunx, it uses bun, etc.
pnpm dlx epicshop setup  # Uses pnpm
bunx epicshop setup      # Uses bun
yarn dlx epicshop setup  # Uses yarn
```

### `add <repo-name[#ref]> [destination]`

Add a workshop by cloning it from the epicweb-dev GitHub organization and
running the setup script.

```bash
epicshop add <repo-name[#ref]> [destination] [options]
```

#### Options

- `--directory, -d <path>` - Directory to clone into (defaults to configured
  repos directory)
- `--silent, -s` - Run without output logs (default: false)

#### Examples

```bash
# Clone and set up the full-stack-foundations workshop
epicshop add full-stack-foundations

# Clone and set up a specific ref
epicshop add full-stack-foundations#v1.2.0

# Clone to a specific destination directory (bypasses configured repos directory)
epicshop add react-fundamentals ~/Desktop/react-fundamentals

# Clone to a custom directory
epicshop add web-forms --directory ~/my-workshops
```

#### What it does

1. Clones the repository from `https://github.com/epicweb-dev/<repo-name>`
2. If a `#ref` is provided, checks out that tag, branch, or commit
3. Automatically runs `epicshop setup` in the cloned directory to install
   dependencies. The package manager used for installation is automatically
   detected based on how you invoked epicshop (e.g., `pnpm dlx epicshop add`
   uses pnpm, `bunx epicshop add` uses bun)
4. If cloned into your configured repos directory, it will show up in
   `epicshop list` and can be started/opened by name

#### Interactive Workshop Selection

When you run `epicshop add` without specifying a repository name, an interactive
workshop picker is displayed with enriched information:

- **Product indicator**: Shows which platform the workshop belongs to with an
  icon (🌌 EpicWeb.dev, ⚡ EpicAI.pro, 🚀 EpicReact.dev)
- **Instructor name**: Displays the workshop instructor
- **Access status**: Shows if you have access to the workshop (✓ for access, ✗
  for no access)

The search supports filtering by workshop name, instructor name, and product
platform.

#### GitHub API Rate Limits

The CLI fetches workshop information from GitHub. To avoid rate limit issues
(especially if you use the CLI frequently), you can set a `GITHUB_TOKEN`
environment variable:

```bash
export GITHUB_TOKEN=your_github_personal_access_token
```

Workshop data is cached locally to minimize API requests.

### `list`

List all workshops that have been added to your local machine. Provides an
interactive interface to select and manage workshops.

```bash
epicshop list [options]
```

#### Options

- `--silent, -s` - Run without output logs (default: false)

#### Examples

```bash
epicshop list
```

### `remove [workshop]`

Remove a workshop by deleting its directory. Context-aware: if inside a
workshop, offers to remove that one; otherwise shows interactive selection.

```bash
epicshop remove [workshop] [options]
```

#### Arguments

- `workshop` (optional) - Workshop name, repo name, or title to remove. If not
  provided and not inside a workshop, you'll be prompted to select from your
  workshops.

#### Options

- `--silent, -s` - Run without output logs (default: false)

#### Examples

```bash
# Inside a workshop directory - offer to remove that workshop
epicshop remove

# Outside a workshop - interactive selection
epicshop remove

# Remove a specific workshop
epicshop remove full-stack-foundations
```

#### Safety Features

- If the workshop has unpushed git changes (uncommitted files or commits not
  pushed to remote), you'll see a colorized summary and be asked to confirm
  deletion
- Always asks for confirmation before deleting

### `open [workshop]`

Open a workshop in your editor. Context-aware: if inside a workshop, opens that
one; otherwise shows interactive selection.

```bash
epicshop open [workshop] [options]
```

#### Arguments

- `workshop` (optional) - Workshop name, repo name, or ID to open

#### Options

- `--silent, -s` - Run without output logs (default: false)

#### Examples

```bash
# Inside a workshop directory - open that workshop
epicshop open

# Outside a workshop - interactive selection
epicshop open

# Open a specific workshop
epicshop open full-stack-foundations
```

#### Editor Detection

The command will try to detect your editor in the following order:

1. `EPICSHOP_EDITOR` environment variable
2. Running editor processes (VS Code, Cursor, Sublime Text, etc.)
3. `VISUAL` environment variable
4. `EDITOR` environment variable

Supported editors include VS Code, Cursor, Sublime Text, Atom, Vim, Emacs, and
many JetBrains IDEs.

You can also set a preferred editor via `epicshop config editor` (or
`epicshop config --editor <command>`). The `open` command will prompt you to
confirm the detected editor the first time and then reuse your preference.

### `config`

View or update workshop configuration settings.

```bash
epicshop config [options]
```

#### Options

- `--repos-dir <path>` - Set the default directory where workshops are cloned
- `--editor <command>` - Set the preferred editor command
- `--silent, -s` - Run without output logs (default: false)

#### Examples

```bash
# View current configuration
epicshop config

# Set the repos directory
epicshop config --repos-dir ~/epicweb-workshops

# Choose a preferred editor
epicshop config editor

# Set preferred editor to VS Code
epicshop config --editor code
```

#### Configuration

- **Repos directory**: The default location where workshops are cloned. Defaults
  to `~/epicweb-workshops` on most systems.
- **Preferred editor**: The editor command the CLI uses when opening workshops.

### `update` / `upgrade`

Update a workshop to the latest version from the remote repository.
Context-aware: if inside a workshop, updates that one; otherwise shows
interactive selection.

```bash
epicshop update [options]
# or
epicshop upgrade [options]
```

#### Options

- `--silent, -s` - Run without output logs (default: false)

#### Examples

```bash
# Inside a workshop - update that workshop
epicshop update

# Outside a workshop - select which to update
epicshop update

# Update silently
epicshop update --silent
```

#### Notes

- Updates are not available in deployed environments
- The command will pull the latest changes from the remote repository
- If updates are available, they will be automatically applied

### `warm`

Warm up the workshop application caches (apps, diffs) for better performance.
Context-aware: if inside a workshop, warms that one; otherwise shows interactive
selection.

```bash
epicshop warm [options]
```

#### Options

- `--silent, -s` - Run without output logs (default: false)

#### Examples

```bash
# Inside a workshop - warm its caches
epicshop warm

# Outside a workshop - select which to warm
epicshop warm

# Warm caches silently
epicshop warm --silent
```

#### What it does

- Loads all workshop apps into memory
- Generates diffs between problem and solution apps
- Pre-caches diff files for faster loading
- Reports the number of apps loaded and diffs generated

### `cleanup`

Clean up local epicshop data using a multi-select prompt. Choose what to delete
from workshops, caches, offline videos, preferences, auth data, and CLI config.

```bash
epicshop cleanup [options]
```

#### Options

- `--targets, -t <name>` - Cleanup targets (repeatable): `caches`,
  `offline-videos`, `preferences`, `auth`, `config`
- `--workshops <name>` - Workshops to clean (repeatable, by repo name or path)
- `--workshop-actions <name>` - Workshop cleanup actions (repeatable): `files`,
  `caches`, `offline-videos`
- `--force, -f` - Skip the confirmation prompt (default: false)
- `--silent, -s` - Run without output logs (default: false)

#### Examples

```bash
# Pick cleanup targets interactively (multi-select)
epicshop cleanup

# Clean selected targets without prompting
epicshop cleanup --targets caches --targets preferences --force

# Clean offline videos for selected workshops without prompting
epicshop cleanup \
  --workshops full-stack-foundations \
  --workshop-actions offline-videos \
  --force
```

#### Notes

- Warns about unpushed workshop changes before deletion
- Removes cache and legacy cache directories when selected
- Preferences/auth cleanup updates local data files in-place
- Config cleanup removes the saved workshops directory setting
- Workshop cleanup prompts for specific workshops, then what to clean for them
- Workshop actions are scoped to selected workshops, not all workshops

### `migrate`

Run any necessary migrations for workshop data.

```bash
epicshop migrate [options]
```

#### Options

- `--silent, -s` - Run without output logs (default: false)

#### Examples

```bash
# Run necessary migrations
epicshop migrate

# Run migrations silently
epicshop migrate --silent
```

### `auth`

Manage login for Epic sites (epicweb.dev, epicreact.dev, epicai.pro). This
command allows you to view login status, log in, and log out.

```bash
epicshop auth [subcommand] [options]
```

#### Subcommands

- `status` - Show login status for all Epic domains
- `login` - Log in to an Epic domain using device authorization flow
- `logout` - Log out from an Epic domain

#### Options

- `--silent, -s` - Run without output logs (default: false)

#### Examples

```bash
# Show interactive auth menu
epicshop auth

# Show login status for all domains
epicshop auth status

# Log in to a domain (interactive domain selection)
epicshop auth login

# Log in to a specific domain
epicshop auth login epicweb.dev
epicshop auth login epicreact
epicshop auth login epicai.pro

# Log out from a domain (interactive selection from logged-in domains)
epicshop auth logout

# Log out from a specific domain
epicshop auth logout epicweb.dev
epicshop auth logout epicreact
```

#### Notes

- The login flow uses OAuth device authorization - you'll be given a URL to open
  in your browser and a code to verify
- Login is stored locally and persists across sessions
- Each domain (epicweb.dev, epicreact.dev, epicai.pro) has separate login
- Being logged in enables features like progress tracking and video access in
  workshops

### `playground`

Manage the playground environment. The playground is where you work on exercises

- it's a copy of the problem app that you can modify. Context-aware: must be run
  from inside a workshop directory.

```bash
epicshop playground [subcommand] [target] [options]
```

#### Subcommands

- `show` - Show current playground status (default)
- `set` - Set the playground to a specific exercise step
- `saved` - List or restore saved playground copies

#### Arguments

- `target` (optional) - Target exercise step (e.g., `1.2.problem`,
  `02.03.solution`)

#### Options

- `--exercise, -e <number>` - Exercise number
- `--step <number>` - Step number
- `--type, -t <type>` - App type (`problem` or `solution`)
- `--list` - List saved playgrounds (saved subcommand)
- `--latest` - Restore the most recent saved playground (saved subcommand)
- `--json` - Output saved playgrounds as JSON (saved list)
- `--silent, -s` - Run without output logs (default: false)

#### Examples

```bash
# Show current playground status
epicshop playground
epicshop playground show

# Select an exercise step to set as the playground (default preselects next step)
epicshop playground set

# Set to a specific step using shorthand notation
epicshop playground set 1.2.problem
epicshop playground set 02.03.solution

# Set using individual options
epicshop playground set --exercise 1 --step 2 --type problem
epicshop playground set -e 1 --step 2 -t solution

# List saved playgrounds
epicshop playground saved list

# Restore the most recent saved playground
epicshop playground saved --latest

# Restore a specific saved playground id
epicshop playground saved 2026.01.18_11.12.00_01.01.problem

# Interactive saved playground selection
epicshop playground saved
```

#### Behavior

- When setting without arguments, prompts you to select an exercise step
  (default selection matches the next incomplete step or next problem after the
  current playground)
- Saved playground selection requires persistence to be enabled in Preferences

### `progress`

View and manage your learning progress for the current workshop. Context-aware:
must be run from inside a workshop directory.

```bash
epicshop progress [subcommand] [lesson-slug] [options]
```

#### Subcommands

- `show` - Show progress for the current workshop (default)
- `update` - Mark a lesson as complete or incomplete

#### Arguments

- `lesson-slug` (optional) - The lesson slug to update (for `update` subcommand)

#### Options

- `--complete, -c` - Mark as complete (default: true)
- `--incomplete, -i` - Mark as incomplete
- `--json` - Output as JSON
- `--silent, -s` - Run without output logs (default: false)

#### Examples

```bash
# Show progress for current workshop
epicshop progress
epicshop progress show

# Output progress as JSON (useful for scripts)
epicshop progress show --json

# Mark a lesson as complete (interactive selection if no slug provided)
epicshop progress update
epicshop progress update 01-01-problem

# Mark a lesson as incomplete
epicshop progress update 01-01-problem --incomplete
```

#### Notes

- Requires being logged in to view and update progress
- Progress is synced with your account on EpicWeb.dev, EpicReact.dev, or
  EpicAI.pro

### `diff`

Show differences between your work and the solution, or between any two apps.
Context-aware: must be run from inside a workshop directory.

```bash
epicshop diff [app1] [app2] [options]
```

#### Arguments

- `app1` (optional) - First app identifier (e.g., `01.02.problem`)
- `app2` (optional) - Second app identifier (e.g., `01.02.solution`)

If no arguments are provided, you will be prompted to select the two apps to
diff (default selection is the playground vs solution).

#### Options

- `--silent, -s` - Run without output logs (default: false)

#### Examples

```bash
# Select apps to diff (defaults to playground vs solution)
epicshop diff

# Show diff between two specific apps
epicshop diff 01.02.problem 01.02.solution

# Compare different steps
epicshop diff 01.01.solution 01.02.problem
```

#### Output

The output is formatted as a git diff with colors:

- Lines starting with `-` (red) show code that needs to be removed
- Lines starting with `+` (green) show code that needs to be added
- Context lines are shown without prefixes

### `exercises`

List exercises or show detailed exercise information. Context-aware: must be run
from inside a workshop directory.

```bash
epicshop exercises [exercise] [step] [options]
```

#### Arguments

- `exercise` (optional) - Exercise number to show details for (e.g., `1` or
  `01`)
- `step` (optional) - Step number to show details for (e.g., `2` or `02`)

#### Options

- `--json` - Output as JSON
- `--silent, -s` - Run without output logs (default: false)

#### Examples

```bash
# List all exercises with progress
epicshop exercises

# Output exercises as JSON
epicshop exercises --json

# Show details for a specific exercise
epicshop exercises 1

# Show details for a specific step
epicshop exercises 1 2
epicshop exercises 01 02
```

#### Output

Lists all exercises with:

- Completion status (✓ complete, ◐ partial, ○ not started)
- Exercise title and step count
- Individual step completion status
- Current playground indicator

## Interactive Command Chooser

When you run `epicshop` without any arguments, an interactive command chooser is
displayed. This shows all available commands with descriptions and allows you to
search and select what you want to do.

If you're inside a workshop directory, the chooser will indicate this and
context-aware commands will operate on that workshop by default.

## Programmatic Usage

All CLI commands can be used programmatically via ESM imports. This is useful
for integrating workshop functionality into your own scripts or applications.

### Importing Commands

```javascript
// Import individual commands
import { start } from 'epicshop/start'
import { update } from 'epicshop/update'
import { warm } from 'epicshop/warm'
```

### Using the Start Command

```javascript
import { start } from 'epicshop/start'

// Start with default options
const result = await start()

// Start with custom options
const result = await start({
	appLocation: '/path/to/workshop-app',
	verbose: true,
	silent: false,
})

// Check result
if (result.success) {
	console.log('Workshop started successfully')
} else {
	console.error('Failed to start workshop:', result.error)
}
```

### Using the Update Command

```javascript
import { update } from 'epicshop/update'

// Update with output
const result = await update({ silent: false })

// Update silently
const result = await update({ silent: true })

if (result.success) {
	console.log('Update successful:', result.message)
} else {
	console.error('Update failed:', result.message)
}
```

### Using the Warm Command

```javascript
import { warm } from 'epicshop/warm'

// Warm caches with output
const result = await warm({ silent: false })

// Warm caches silently
const result = await warm({ silent: true })

if (result.success) {
	console.log('Cache warming complete:', result.message)
} else {
	console.error('Cache warming failed:', result.message)
}
```

### Using Workshop Management Functions

```javascript
import {
	add,
	list,
	remove,
	startWorkshop,
	openWorkshop,
	config,
	findWorkshopRoot,
} from 'epicshop/workshops'

// Detect if currently inside a workshop
const workshopRoot = await findWorkshopRoot()
if (workshopRoot) {
	console.log(`Inside workshop: ${workshopRoot}`)
}

// Add a workshop
const addResult = await add({
	repoName: 'full-stack-foundations',
	directory: '/path/to/workshops', // optional
	silent: false,
})

// List all workshops
const listResult = await list({ silent: false })

// Remove a workshop
const removeResult = await remove({
	workshop: 'full-stack-foundations',
	silent: false,
})

// Start a workshop (interactive if no workshop specified)
const startResult = await startWorkshop({
	workshop: 'full-stack-foundations', // optional
	silent: false,
})

// Open a workshop in your editor (interactive if no workshop specified)
const openResult = await openWorkshop({
	workshop: 'full-stack-foundations', // optional
	silent: false,
})

// View or update configuration
const configResult = await config({
	reposDir: '/path/to/repos', // optional, omit to view config
	silent: false,
})
```

### Using the Auth Command

```javascript
import { status, login, logout } from 'epicshop/auth'

// Show auth status for all domains
const statusResult = await status({ silent: false })

// Login to a specific domain
const loginResult = await login({
	domain: 'epicweb.dev', // optional, prompts interactively if omitted
	silent: false,
})

// Logout from a domain
const logoutResult = await logout({
	domain: 'epicweb.dev', // optional, prompts interactively if omitted
	silent: false,
})

if (loginResult.success) {
	console.log('Login successful:', loginResult.message)
} else {
	console.error('Login failed:', loginResult.message)
}
```

### Using the Playground Command

```javascript
import {
	show,
	set,
	selectAndSet,
	parseAppIdentifier,
} from 'epicshop/playground'

// Show current playground status
const showResult = await show({ silent: false })

// Set playground to next incomplete step (auto-detect)
const setResult = await set({ silent: false })

// Set playground to a specific step
const setSpecificResult = await set({
	exerciseNumber: 1,
	stepNumber: 2,
	type: 'problem',
	silent: false,
})

// Parse an app identifier string
const parsed = parseAppIdentifier('1.2.solution')
// { exerciseNumber: 1, stepNumber: 2, type: 'solution' }

// Interactive selection
const selectResult = await selectAndSet({ silent: false })
```

### Using the Progress Command

```javascript
import { show, update } from 'epicshop/progress'

// Show progress for current workshop
const progressResult = await show({ silent: false })

// Output as JSON
const jsonResult = await show({ json: true })

// Mark a lesson as complete
const updateResult = await update({
	lessonSlug: '01-01-problem',
	complete: true,
	silent: false,
})

// Mark a lesson as incomplete
const incompleteResult = await update({
	lessonSlug: '01-01-problem',
	complete: false,
	silent: false,
})
```

### Using the Diff Command

```javascript
import { showProgressDiff, showDiffBetweenApps } from 'epicshop/diff'

// Show diff between playground and solution
const progressDiffResult = await showProgressDiff({ silent: false })
console.log(progressDiffResult.diff)

// Show diff between two specific apps
const appsDiffResult = await showDiffBetweenApps({
	app1: '01.02.problem',
	app2: '01.02.solution',
	silent: false,
})
```

### Using the Exercises Command

```javascript
import { list, showExercise } from 'epicshop/exercises'

// List all exercises
const listResult = await list({ silent: false })

// Output as JSON
const jsonListResult = await list({ json: true })

// Show details for a specific exercise
const exerciseResult = await showExercise({
	exerciseNumber: 1,
	silent: false,
})

// Show details for a specific step
const stepResult = await showExercise({
	exerciseNumber: 1,
	stepNumber: 2,
	json: true,
})
```

### TypeScript Support

All commands are fully typed with TypeScript:

```typescript
import { start, type StartOptions, type StartResult } from 'epicshop/start'
import { update, type UpdateResult } from 'epicshop/update'
import { warm, type WarmResult } from 'epicshop/warm'
import {
	add,
	list,
	startWorkshop,
	openWorkshop,
	config,
	findWorkshopRoot,
	type WorkshopsResult,
	type AddOptions,
	type StartOptions as WorkshopStartOptions,
	type ConfigOptions,
} from 'epicshop/workshops'
import {
	show as showPlayground,
	set as setPlayground,
	selectAndSet,
	parseAppIdentifier,
	type PlaygroundResult,
	type PlaygroundShowOptions,
	type PlaygroundSetOptions,
} from 'epicshop/playground'
import {
	show as showProgress,
	update as updateProgress,
	type ProgressResult,
	type ProgressShowOptions,
	type ProgressUpdateOptions,
} from 'epicshop/progress'
import {
	showProgressDiff,
	showDiffBetweenApps,
	type DiffResult,
	type DiffOptions,
} from 'epicshop/diff'
import {
	list as listExercises,
	showExercise,
	type ExercisesResult,
	type ExercisesListOptions,
	type ExerciseContextOptions,
} from 'epicshop/exercises'
import {
	status,
	login,
	logout,
	type AuthResult,
	type AuthStatusOptions,
	type AuthLoginOptions,
	type AuthLogoutOptions,
} from 'epicshop/auth'

const options: StartOptions = {
	appLocation: '/path/to/workshop',
	verbose: true,
	silent: false,
}

const result: StartResult = await start(options)
```

### Integration Example

```javascript
import { start } from 'epicshop/start'
import { warm } from 'epicshop/warm'

async function setupWorkshop() {
	try {
		// Warm up caches first
		console.log('Warming up caches...')
		const warmResult = await warm({ silent: false })

		if (!warmResult.success) {
			throw new Error(`Cache warming failed: ${warmResult.message}`)
		}

		// Start the workshop
		console.log('Starting workshop...')
		const startResult = await start({ verbose: true })

		if (!startResult.success) {
			throw new Error(`Failed to start workshop: ${startResult.message}`)
		}

		console.log('Workshop setup complete!')
	} catch (error) {
		console.error('Workshop setup failed:', error)
		process.exit(1)
	}
}

setupWorkshop()
```

## Environment Variables

- `EPICSHOP_APP_LOCATION` - Path to the workshop app directory
- `EPICSHOP_DEPLOYED` - Set to `true` or `1` for deployed environments
- `EPICSHOP_EDITOR` - Preferred editor for opening workshops
- `GITHUB_TOKEN` - GitHub personal access token for API requests (helps avoid
  rate limits when fetching workshop information)
- `NODE_ENV` - Set to `production` for production mode
- `SENTRY_DSN` - Sentry DSN for error tracking and distributed tracing in
  production
- `SENTRY_AUTH_TOKEN` - Sentry auth token for source map uploads during build
- `SENTRY_ORG` - Sentry organization slug for source map uploads
- `SENTRY_PROJECT` - Sentry project slug for source map uploads
- `SENTRY_RELEASE` - Optional release name for matching source maps to events
- `EPICSHOP_APP_COMMIT_SHA` - Release fallback for source map matching

## Interactive Features

When running `epicshop start`, the following interactive features are available:

- **Update Check**: The CLI automatically checks for updates on startup
- **Dependency Check**: Prompts when `package.json` and installed packages are
  out of sync
- **Keyboard Shortcuts**:
  - Press `u` to check for and apply updates
  - Press `d` to dismiss update notifications
- **Auto-restart**: The server automatically restarts after applying updates

## Error Handling

The CLI provides clear error messages for common issues:

- Missing workshop app directory
- Port conflicts
- Update failures
- Cache warming errors

## Development vs Production

The CLI automatically detects the environment:

- **Development**: Uses `./server/dev-server.js` for development
- **Production**: Uses `./start.js` with optional Sentry instrumentation

## Troubleshooting

### Workshop App Not Found

If the CLI can't find the workshop app:

1. Ensure the workshop app is installed: `npm install -g @epic-web/workshop-app`
2. Set the `EPICSHOP_APP_LOCATION` environment variable
3. Use the `--app-location` flag to specify the path

### Port Conflicts

The CLI automatically finds available ports starting from 3742. If you encounter
port issues:

1. Check if another process is using the port
2. Stop other development servers
3. Use a different port by setting environment variables

### Update Issues

If updates fail:

1. Ensure you have write permissions to the workshop directory
2. Check your internet connection
3. Verify the remote repository is accessible
4. Try running the update command manually

## Examples

### Basic Workshop Setup

```bash
# First-time setup (initializes and starts tutorial)
epicshop init

# Or add a specific workshop
epicshop add full-stack-foundations

# Or add a specific ref
epicshop add full-stack-foundations#v1.2.0

# Start the workshop
epicshop start

# Warm up caches for better performance
epicshop warm
```

### Managing Multiple Workshops

```bash
# Add several workshops
epicshop add full-stack-foundations
epicshop add web-forms
epicshop add react-fundamentals

# List all workshops
epicshop list

# Start any workshop by name
epicshop start web-forms

# Or cd into the workshop and just run start
cd ~/epicweb-workshops/web-forms
epicshop start
```

### Custom Configuration

```bash
# Set where workshops are stored
epicshop config --repos-dir ~/my-workshops

# Start with verbose output
epicshop start --verbose

# Start silently for programmatic usage
epicshop start --silent

# Update silently
epicshop update --silent

# Use your preferred package manager - epicshop automatically detects it
pnpm dlx epicshop add  # Uses pnpm for installs
bunx epicshop add      # Uses bun for installs
yarn dlx epicshop add  # Uses yarn for installs
```

### Production Deployment

```bash
# Set production environment
export NODE_ENV=production
export EPICSHOP_DEPLOYED=true

# Start in production mode
epicshop start
```

## Command Reference Summary

| Command               | Description                       | Context-Aware |
| --------------------- | --------------------------------- | ------------- |
| `epicshop`            | Interactive command chooser       | ✓             |
| `epicshop start`      | Start a workshop                  | ✓             |
| `epicshop init`       | First-time setup wizard           | ✗             |
| `epicshop setup`      | Install workshop dependencies     | ✗             |
| `epicshop add`        | Clone a workshop from epicweb-dev | ✗             |
| `epicshop list`       | List all workshops                | ✗             |
| `epicshop remove`     | Remove a workshop                 | ✓             |
| `epicshop open`       | Open workshop in editor           | ✓             |
| `epicshop config`     | View/update configuration         | ✗             |
| `epicshop update`     | Update workshop to latest version | ✓             |
| `epicshop warm`       | Warm up caches                    | ✓             |
| `epicshop migrate`    | Run data migrations               | ✗             |
| `epicshop auth`       | Manage login for Epic sites       | ✗             |
| `epicshop playground` | Manage the playground environment | ✓             |
| `epicshop progress`   | View and manage learning progress | ✓             |
| `epicshop diff`       | Show differences between apps     | ✓             |
| `epicshop exercises`  | List exercises or show details    | ✓             |
