# Programmatic API

The `@epic-web/workshop-cli` package now provides a programmatic API that allows you to run CLI commands from your code instead of only from the command line.

## Installation

```bash
npm install @epic-web/workshop-cli
```

## Usage

### Basic Setup

```typescript
import {
  startCommand,
  updateCommand,
  warmCommand,
  openWorkshop,
  checkForUpdates,
  dismissUpdateNotification,
  initializeEnvironment,
  type StartCommandOptions,
  type CommandResult,
} from '@epic-web/workshop-cli'

// Initialize environment first (required)
await initializeEnvironment()
```

### Available Functions

#### `initializeEnvironment(): Promise<CommandResult>`

Initialize the workshop environment. **This must be called before using any other functions.**

```typescript
const result = await initializeEnvironment()
if (!result.success) {
  console.error('Failed to initialize:', result.message)
}
```

#### `startCommand(options?: StartCommandOptions): Promise<CommandResult>`

Start the workshop application programmatically.

```typescript
const result = await startCommand({
  verbose: true,
  appLocation: '/path/to/workshop-app' // optional
})
```

**Options:**
- `verbose?: boolean` - Show verbose output
- `appLocation?: string` - Path to the workshop app directory

#### `updateCommand(): Promise<CommandResult>`

Update the workshop to the latest version.

```typescript
const result = await updateCommand()
console.log(result.success ? 'Updated!' : 'Update failed:', result.message)
```

#### `warmCommand(): Promise<CommandResult>`

Warm up the workshop application caches (apps, diffs).

```typescript
const result = await warmCommand()
console.log(`Cache warming: ${result.message}`)
```

#### `openWorkshop(): Promise<CommandResult>`

Open the workshop application in the browser.

```typescript
const result = await openWorkshop()
console.log(`Workshop opened at: ${result.message}`)
```

#### `checkForUpdates(): Promise<CommandResult & { updatesAvailable?: number; diffLink?: string }>`

Check for available updates.

```typescript
const result = await checkForUpdates()
if (result.updatesAvailable) {
  console.log(`${result.updatesAvailable} updates available`)
  console.log(`View changes: ${result.diffLink}`)
}
```

#### `dismissUpdateNotification(): Promise<CommandResult>`

Dismiss update notifications permanently.

```typescript
const result = await dismissUpdateNotification()
console.log(result.success ? 'Notification dismissed' : 'No notifications to dismiss')
```

### Types

#### `CommandResult`

All functions return a `CommandResult` object:

```typescript
interface CommandResult {
  success: boolean
  message?: string
  error?: Error
}
```

#### `StartCommandOptions`

Options for the `startCommand` function:

```typescript
interface StartCommandOptions {
  appLocation?: string
  verbose?: boolean
}
```

### Complete Example

```typescript
import {
  startCommand,
  updateCommand,
  warmCommand,
  openWorkshop,
  checkForUpdates,
  initializeEnvironment,
} from '@epic-web/workshop-cli'

async function runWorkshop() {
  // Initialize first
  const initResult = await initializeEnvironment()
  if (!initResult.success) {
    console.error('Failed to initialize:', initResult.message)
    return
  }

  // Check for updates
  const updateCheck = await checkForUpdates()
  if (updateCheck.updatesAvailable) {
    console.log(`${updateCheck.updatesAvailable} updates available`)
    
    // Optionally update
    const updateResult = await updateCommand()
    console.log(updateResult.success ? 'Updated!' : 'Update failed')
  }

  // Warm caches
  await warmCommand()

  // Start the workshop
  const startResult = await startCommand({ verbose: true })
  if (startResult.success) {
    // Open in browser after a delay
    setTimeout(() => openWorkshop(), 3000)
  }
}

runWorkshop().catch(console.error)
```

### Error Handling

All functions return a `CommandResult` with a `success` boolean. Check this before proceeding:

```typescript
const result = await startCommand()
if (!result.success) {
  console.error('Command failed:', result.message)
  if (result.error) {
    console.error('Error details:', result.error)
  }
  return
}
```

### Environment Variables

The programmatic API respects the same environment variables as the CLI:

- `EPICSHOP_APP_LOCATION` - Path to workshop app
- `EPICSHOP_CONTEXT_CWD` - Workshop context directory
- `EPICSHOP_DEPLOYED` - Whether running in deployed environment
- `NODE_ENV` - Environment mode
- `SENTRY_DSN` - Sentry configuration

### Notes

- The `startCommand` function will start a child process and set up servers, similar to the CLI
- Make sure to handle cleanup properly in your application
- The environment must be initialized before using other functions
- Some functions may not work in deployed environments (like `updateCommand`)