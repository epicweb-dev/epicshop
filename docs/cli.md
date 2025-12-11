# EpicShop CLI Documentation

The EpicShop CLI provides commands to manage and run Epic workshops. It's
designed to help you start workshops, update them to the latest version, and
warm up caches for better performance.

The CLI can be used both as a command-line tool and programmatically via ESM
imports.

## Installation

The CLI is typically installed as part of the EpicShop workshop setup. If you
need to install it separately:

```bash
npm install -g @epic-web/workshop-cli
```

## Commands

### `start` (default command)

Start the workshop application with interactive features.

```bash
epicshop start [options]
# or simply
epicshop [options]
```

#### Options

- `--verbose, -v` - Show verbose output (default: false)
- `--silent, -s` - Run without output logs (default: false)
- `--app-location <path>` - Path to the workshop app directory

#### Examples

```bash
# Start the workshop with default settings
epicshop start

# Start with verbose logging
epicshop start --verbose

# Start with a custom app location
epicshop start --app-location /path/to/workshop-app

# Start without output logs
epicshop start --silent
```

#### Features

- **Interactive Updates**: Press `u` to check for and apply updates while the
  server is running
- **Update Dismissal**: Press `d` to dismiss update notifications
- **Auto-restart**: Automatically restarts the server after updates
- **Port Management**: Automatically finds available ports
- **Environment Detection**: Detects production vs development environments

#### App Location Resolution

The CLI will look for the workshop app in the following order:

1. `--app-location` command line argument
2. `EPICSHOP_APP_LOCATION` environment variable
3. Global installation (`npm install -g @epic-web/workshop-app`)
4. Local `node_modules/@epic-web/workshop-app`

### `update` / `upgrade`

Update the workshop to the latest version from the remote repository.

```bash
epicshop update [options]
# or
epicshop upgrade [options]
```

#### Options

- `--silent, -s` - Run without output logs (default: false)

#### Examples

```bash
# Update to latest version with output
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

```bash
epicshop warm [options]
```

#### Options

- `--silent, -s` - Run without output logs (default: false)

#### Examples

```bash
# Warm up caches with progress output
epicshop warm

# Warm up caches silently
epicshop warm --silent
```

#### What it does

- Loads all workshop apps into memory
- Generates diffs between problem and solution apps
- Pre-caches diff files for faster loading
- Reports the number of apps loaded and diffs generated

### `workshops`

Manage local workshops on your machine. This command allows you to add, list,
remove, and start workshops from the epicweb-dev GitHub organization.

```bash
epicshop workshops [subcommand] [options]
```

#### Subcommands

##### `workshops init` (default)

Initialize EpicShop for first-time users. This command runs an interactive setup
wizard that:

1. Welcomes the user and explains what EpicShop does
2. Prompts for a workshop storage directory (with a recommended default)
3. Clones and sets up the `epicshop-tutorial` repository
4. Starts the tutorial workshop

```bash
epicshop workshops init
# or simply
epicshop workshops
```

This is the default subcommand, so running `epicshop workshops` without any
arguments will start the onboarding flow.

##### `workshops add <repo-name>`

Add a workshop by cloning it from the epicweb-dev GitHub organization and
running the setup script.

```bash
epicshop workshops add <repo-name> [options]
```

**Options:**

- `--directory, -d <path>` - Directory to clone into (defaults to configured
  repos directory)
- `--silent, -s` - Run without output logs (default: false)

**Examples:**

```bash
# Clone and set up the full-stack-foundations workshop
epicshop workshops add full-stack-foundations

# Clone to a custom directory
epicshop workshops add web-forms --directory ~/my-workshops
```

**What it does:**

1. Clones the repository from `https://github.com/epicweb-dev/<repo-name>`
2. Runs `npm run setup` in the cloned directory
3. Adds the workshop to your local workshop registry

##### `workshops list`

List all workshops that have been added to your local machine.

```bash
epicshop workshops list [options]
```

**Options:**

- `--silent, -s` - Run without output logs (default: false)

**Example:**

```bash
epicshop workshops list
```

##### `workshops remove [workshop]`

Remove a workshop by deleting its directory. If no workshop is specified, an
interactive selection menu will be shown.

```bash
epicshop workshops remove [workshop] [options]
```

**Arguments:**

- `workshop` (optional) - Workshop name, repo name, or title to remove. If not
  provided, you'll be prompted to select from your workshops.

**Options:**

- `--silent, -s` - Run without output logs (default: false)

**Examples:**

```bash
# Interactive selection
epicshop workshops remove

# Remove a specific workshop
epicshop workshops remove full-stack-foundations
```

**Safety Features:**

- If the workshop has unpushed git changes (uncommitted files or commits not
  pushed to remote), you'll see a colorized summary and be asked to confirm
  deletion
- Always asks for confirmation before deleting

##### `workshops start [workshop]`

Start a workshop. If no workshop is specified, an interactive selection menu
will be shown.

```bash
epicshop workshops start [workshop] [options]
```

**Arguments:**

- `workshop` (optional) - Workshop name, repo name, or ID to start

**Options:**

- `--silent, -s` - Run without output logs (default: false)

**Examples:**

```bash
# Interactive selection
epicshop workshops start

# Start a specific workshop
epicshop workshops start full-stack-foundations
```

##### `workshops config`

View or update workshop configuration settings.

```bash
epicshop workshops config [options]
```

**Options:**

- `--repos-dir <path>` - Set the default directory where workshops are cloned
- `--silent, -s` - Run without output logs (default: false)

**Examples:**

```bash
# View current configuration
epicshop workshops config

# Set the repos directory
epicshop workshops config --repos-dir ~/epicweb-workshops
```

**Configuration:**

- **Repos directory**: The default location where workshops are cloned. Defaults
  to `~/epicweb-workshops` on most systems.

## Programmatic Usage

All CLI commands can be used programmatically via ESM imports. This is useful
for integrating workshop functionality into your own scripts or applications.

### Importing Commands

```javascript
// Import individual commands
import { start } from '@epic-web/workshop-cli/start'
import { update } from '@epic-web/workshop-cli/update'
import { warm } from '@epic-web/workshop-cli/warm'
```

### Using the Start Command

```javascript
import { start } from '@epic-web/workshop-cli/start'

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
import { update } from '@epic-web/workshop-cli/update'

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
import { warm } from '@epic-web/workshop-cli/warm'

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

### Using the Workshops Command

```javascript
import {
	add,
	list,
	remove,
	startWorkshop,
	config,
} from '@epic-web/workshop-cli/workshops'

// Add a workshop
const addResult = await add({
	repoName: 'full-stack-foundations',
	directory: '/path/to/workshops', // optional
	silent: false,
})

// List all workshops
const listResult = await list({ silent: false })

// Remove a workshop from the list
const removeResult = await remove({
	workshop: 'full-stack-foundations',
	silent: false,
})

// Start a workshop (interactive if no workshop specified)
const startResult = await startWorkshop({
	workshop: 'full-stack-foundations', // optional
	silent: false,
})

// View or update configuration
const configResult = await config({
	reposDir: '/path/to/repos', // optional, omit to view config
	silent: false,
})
```

### TypeScript Support

All commands are fully typed with TypeScript:

```typescript
import {
	start,
	type StartOptions,
	type StartResult,
} from '@epic-web/workshop-cli/start'
import { update, type UpdateResult } from '@epic-web/workshop-cli/update'
import { warm, type WarmResult } from '@epic-web/workshop-cli/warm'
import {
	add,
	list,
	startWorkshop,
	config,
	type WorkshopsResult,
	type AddOptions,
	type StartOptions as WorkshopStartOptions,
	type ConfigOptions,
} from '@epic-web/workshop-cli/workshops'

const options: StartOptions = {
	appLocation: '/path/to/workshop',
	verbose: true,
	silent: false,
}

const result: StartResult = await start(options)
```

### Integration Example

```javascript
import { start } from '@epic-web/workshop-cli/start'
import { warm } from '@epic-web/workshop-cli/warm'

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
# Install the workshop app globally
npm install -g @epic-web/workshop-app

# Start the workshop
epicshop start

# Warm up caches for better performance
epicshop warm
```

### Custom Configuration

```bash
# Start with custom app location and verbose output
epicshop start --app-location ./my-workshop --verbose

# Start silently for programmatic usage
epicshop start --silent

# Update silently
epicshop update --silent

# Warm caches silently
epicshop warm --silent
```

### Production Deployment

```bash
# Set production environment
export NODE_ENV=production
export EPICSHOP_DEPLOYED=true

# Start in production mode
epicshop start
```
