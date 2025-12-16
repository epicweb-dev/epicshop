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

### `add <repo-name>`

Add a workshop by cloning it from the epicweb-dev GitHub organization and
running the setup script.

```bash
epicshop add <repo-name> [options]
```

#### Options

- `--directory, -d <path>` - Directory to clone into (defaults to configured
  repos directory)
- `--silent, -s` - Run without output logs (default: false)

#### Examples

```bash
# Clone and set up the full-stack-foundations workshop
epicshop add full-stack-foundations

# Clone to a custom directory
epicshop add web-forms --directory ~/my-workshops
```

#### What it does

1. Clones the repository from `https://github.com/epicweb-dev/<repo-name>`
2. Runs `npm run setup` in the cloned directory
3. Adds the workshop to your local workshop registry

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

### `config`

View or update workshop configuration settings.

```bash
epicshop config [options]
```

#### Options

- `--repos-dir <path>` - Set the default directory where workshops are cloned
- `--silent, -s` - Run without output logs (default: false)

#### Examples

```bash
# View current configuration
epicshop config

# Set the repos directory
epicshop config --repos-dir ~/epicweb-workshops
```

#### Configuration

- **Repos directory**: The default location where workshops are cloned. Defaults
  to `~/epicweb-workshops` on most systems.

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
- `SENTRY_DSN` - Sentry DSN for error tracking in production

## Interactive Features

When running `epicshop start`, the following interactive features are available:

- **Update Check**: The CLI automatically checks for updates on startup
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

| Command            | Description                       | Context-Aware |
| ------------------ | --------------------------------- | ------------- |
| `epicshop`         | Interactive command chooser       | ✓             |
| `epicshop start`   | Start a workshop                  | ✓             |
| `epicshop init`    | First-time setup wizard           | ✗             |
| `epicshop add`     | Clone a workshop from epicweb-dev | ✗             |
| `epicshop list`    | List all workshops                | ✗             |
| `epicshop remove`  | Remove a workshop                 | ✓             |
| `epicshop open`    | Open workshop in editor           | ✓             |
| `epicshop config`  | View/update configuration         | ✗             |
| `epicshop update`  | Update workshop to latest version | ✓             |
| `epicshop warm`    | Warm up caches                    | ✓             |
| `epicshop migrate` | Run data migrations               | ✗             |
| `epicshop auth`    | Manage login for Epic sites       | ✗             |
