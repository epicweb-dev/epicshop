# Configuration

The Epic Workshop app can be configured using the `epicshop` field in the
`package.json` file. This document outlines all available configuration options.

## Workshop Configuration

These options should be set in the root `package.json` of your workshop.

| Option                                 | Type      | Description                                        | Default                                                       |
| -------------------------------------- | --------- | -------------------------------------------------- | ------------------------------------------------------------- |
| `title`                                | `string`  | The title of your workshop                         | Required                                                      |
| `subtitle`                             | `string`  | A subtitle for your workshop                       | Optional                                                      |
| `instructor`                           | `object`  | Information about the instructor                   | Optional                                                      |
| `instructor.name`                      | `string`  | Name of the instructor                             | Optional                                                      |
| `instructor.avatar`                    | `string`  | Path to the instructor's avatar image              | Optional                                                      |
| `instructor.𝕏` or `instructor.xHandle` | `string`  | Instructor's X (formerly Twitter) handle           | Optional                                                      |
| `subdomain`                            | `string`  | Subdomain for the workshop                         | Optional (falls back to sanitized `name` property if not set) |
| `product`                              | `object`  | Product configuration                              | Optional                                                      |
| `githubRepo`                           | `string`  | URL to the GitHub repository                       | Required if `githubRoot` is not provided                      |
| `githubRoot`                           | `string`  | Root URL for GitHub file links                     | Required if `githubRepo` is not provided                      |
| `stackBlitzConfig`                     | `object`  | Configuration for StackBlitz                       | Optional                                                      |
| `forms.workshop`                       | `string`  | URL template for workshop feedback form            | Has a default value                                           |
| `forms.exercise`                       | `string`  | URL template for exercise feedback form            | Has a default value                                           |
| `testTab.enabled`                      | `boolean` | Whether to enable the test tab                     | `true`                                                        |
| `scripts.postupdate`                   | `string`  | Script to run after workshop update                | Optional                                                      |
| `initialRoute`                         | `string`  | Initial route for the app                          | `"/"`                                                         |
| `notifications`                        | `array`   | Custom notifications for this workshop             | `[]`                                                          |
| `sidecarProcesses`                     | `object`  | Additional processes to run alongside the workshop | `{}`                                                          |
| `appType`                              | `string`  | Default app type for simple apps (`"export"`)      | Optional                                                      |

## Product Configuration

The `product` object can have the following properties:

| Option             | Type     | Description                                         | Default             |
| ------------------ | -------- | --------------------------------------------------- | ------------------- |
| `host`             | `string` | Host for the product (used for API calls and links) | `"www.epicweb.dev"` |
| `displayName`      | `string` | Display name of the product                         | `"EpicWeb.dev"`     |
| `displayNameShort` | `string` | Short display name of the product                   | `"Epic Web"`        |
| `logo`             | `string` | Path to the product logo                            | `"/logo.svg"`       |
| `slug`             | `string` | Slug for the product                                | Optional            |

> NOTE: in the future, we'll likely add localization to the Epicshop application
> so you can more easily define custom messages throughout the workshop UI.
> Until then, the `displayName` and `displayNameShort` will be used for all
> messages where the product name is displayed.

## Sidecar Processes

The `sidecarProcesses` configuration allows you to run additional processes
alongside your workshop app. This is useful for running backend services,
databases, or other supporting applications that your workshop exercises might
need.

### Configuration

The `sidecarProcesses` field is an object where:

- **Keys** are the display names for your processes (used in console output)
- **Values** are the shell commands to run

### Example

```json
{
	"epicshop": {
		"title": "My Workshop",
		"sidecarProcesses": {
			"BackendAPI": "npm run dev --prefix ./backend",
			"Database": "docker run --rm -p 5432:5432 postgres:15",
			"MockServer": "npx json-server --watch db.json --port 3001"
		}
	}
}
```

### Features

- **Colored Output**: Each sidecar process gets its own color in the console
  output for easy identification
- **Prefixed Logs**: All output is prefixed with the process name (e.g.,
  `[BackendAPI]`)
- **Automatic Cleanup**: Processes are automatically stopped when the workshop
  app shuts down
- **Error Handling**: If a sidecar process fails to start, it won't prevent the
  workshop app from running

### Console Output Example

When you start your workshop, you'll see output like this:

```
🐨  Let's get learning!
🚀 Starting sidecar processes...
[BackendAPI] started
[Database] started
[MockServer] started
[BackendAPI] Server listening on port 3000
[Database] PostgreSQL init process complete; ready for start up
[MockServer] JSON Server is running on http://localhost:3001
```

### Best Practices

1. **Use relative paths** for npm scripts to ensure they work across different
   environments
2. **Include `--prefix`** when running npm commands in subdirectories
3. **Use appropriate ports** that don't conflict with the workshop app (which
   typically runs on port 5639)
4. **Test locally** to ensure all processes start correctly before sharing your
   workshop

## Subdomain Configuration

You can configure your workshop to use a custom subdomain by setting the
`subdomain` option in your `epicshop` configuration. This is useful for branding
your workshop or creating a more professional URL structure.

### How it Works

When you configure a subdomain, the workshop will be available at
`{subdomain}.localhost:{PORT}` instead of the default `localhost:{PORT}`. The
system automatically:

1. **Generates subdomain URLs** - All workshop URLs will use the subdomain
   format
2. **Adds redirect functionality** - Requests to the non-subdomain URL will be
   automatically redirected to the subdomain URL
3. **Updates CLI output** - The command line interface will display the
   subdomain URL and mention the redirect
4. **Fallback to package name** - If no `subdomain` is configured, the workshop
   will automatically use the sanitized `name` property from your root
   `package.json` as the subdomain. This means your workshop will be available
   at `{sanitized-name}.localhost:{PORT}`. The name is lowercased,
   non-alphanumeric characters are replaced with dashes, and leading/trailing
   dashes are removed.

### Example

```json
{
	"epicshop": {
		"title": "Advanced React Patterns",
		"subdomain": "react-patterns"
		// ... other configuration
	}
}
```

With this configuration:

- Workshop will be available at `http://react-patterns.localhost:5639`
- Requests to `http://localhost:5639` will redirect to
  `http://react-patterns.localhost:5639`
- CLI will show:
  `Local: http://react-patterns.localhost:5639 (redirects from http://localhost:5639)`

### Notes

- The subdomain only works with `localhost` - it's designed for local
  development
- The subdomain should be a valid hostname (lowercase letters, numbers, and
  hyphens)
- If no subdomain is configured, the workshop will use the sanitized `name`
  property from your root `package.json` as the subdomain
- All workshop functionality (hot reloading, WebSocket connections, etc.) works
  normally with subdomains

### Logo

You can provide a custom logo for your workshop. A regular image placed in the
workshop's `public` directory will do, but if you want to support
light/dark/monochrome themes, you can provide an SVG with definitions for each
theme.

Here's an example of the Epic React `logo.svg` file:

```svg
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
	<symbol id="monochrome" viewBox="0 0 133 140" fill="none">
		<g stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="8">
			<path d="M100.109 69.173c17.025-13.337 26.625-26.064 23.035-32.283-5.086-8.809-34.715-1.225-66.177 16.94C25.505 71.994 4.123 93.86 9.21 102.67c2.741 4.747 12.61 4.733 26.051.869"></path>
			<path d="M87.724 78.505c-11.84 7.894-21.534 11.409-21.05 11.84 27.843 14.45 51.883 20.265 56.469 12.322 4.701-8.142-13.211-27.441-40.796-44.66M35.364 36.042c-13.495-3.894-23.406-3.92-26.154.84-3.618 6.267 6.157 19.14 23.426 32.589"></path>
			<path d="M80.33 27.68C76.952 13.21 71.866 4 66.177 4 56.005 4 47.76 33.45 47.76 69.78c0 36.329 8.246 65.78 18.418 65.78 5.605 0 10.626-8.941 14.004-23.048"></path>
		</g>
	</symbol>

	<symbol id="light" viewBox="0 0 133 140" fill="none">
		<g stroke="#225FEB" stroke-linecap="round" stroke-linejoin="round" stroke-width="8">
			<path d="M100.109 69.173c17.025-13.337 26.625-26.064 23.035-32.283-5.086-8.809-34.715-1.225-66.177 16.94C25.505 71.994 4.123 93.86 9.21 102.67c2.741 4.747 12.61 4.733 26.051.869"></path>
			<path d="M87.724 78.505c-11.84 7.894-21.534 11.409-21.05 11.84 27.843 14.45 51.883 20.265 56.469 12.322 4.701-8.142-13.211-27.441-40.796-44.66M35.364 36.042c-13.495-3.894-23.406-3.92-26.154.84-3.618 6.267 6.157 19.14 23.426 32.589"></path>
			<path d="M80.33 27.68C76.952 13.21 71.866 4 66.177 4 56.005 4 47.76 33.45 47.76 69.78c0 36.329 8.246 65.78 18.418 65.78 5.605 0 10.626-8.941 14.004-23.048"></path>
		</g>
	</symbol>

	<symbol id="dark" viewBox="0 0 133 140" fill="none">
		<g stroke="#81A7FF" stroke-linecap="round" stroke-linejoin="round" stroke-width="8">
			<path d="M100.109 69.173c17.025-13.337 26.625-26.064 23.035-32.283-5.086-8.809-34.715-1.225-66.177 16.94C25.505 71.994 4.123 93.86 9.21 102.67c2.741 4.747 12.61 4.733 26.051.869"></path>
			<path d="M87.724 78.505c-11.84 7.894-21.534 11.409-21.05 11.84 27.843 14.45 51.883 20.265 56.469 12.322 4.701-8.142-13.211-27.441-40.796-44.66M35.364 36.042c-13.495-3.894-23.406-3.92-26.154.84-3.618 6.267 6.157 19.14 23.426 32.589"></path>
			<path d="M80.33 27.68C76.952 13.21 71.866 4 66.177 4 56.005 4 47.76 33.45 47.76 69.78c0 36.329 8.246 65.78 18.418 65.78 5.605 0 10.626-8.941 14.004-23.048"></path>
		</g>
	</symbol>
</svg>
```

The critical bits there are the `symbol` definitions. These are used to
dynamically generate the logos for light/dark/monochrome themes. It's
recommended that `monochrome` use `currentColor` for the stroke or fill, so it
will use the correct color for the context in which it's viewed.

### Favicon

To adjust the favicon, simply add a `favicon.ico` and a `favicon.svg` file to
the `public` directory of your workshop repository. You can use media queries
for light/dark themes in the `favicon.svg` file.

### Open Graph Image

To adjust the open graph image, simply add an `og/background.png` file and a
`og/logo.svg` file to the `public` directory of your workshop repository. This
image will have an opacity of `0.3` (with a black background) to ensure text
overlay is legible. The workshop details will be overlayed on top of that image.

Additionally, instructor details which you configure in the root `package.json`
will be included in the open graph image.

## StackBlitz Configuration

The `stackBlitzConfig` object can have the following properties:

| Option        | Type                                  | Description                             |
| ------------- | ------------------------------------- | --------------------------------------- |
| `title`       | `string`                              | Title for the StackBlitz project        |
| `startScript` | `string`                              | Script to run when starting the project |
| `view`        | `"editor"` \| `"preview"` \| `"both"` | Initial view in StackBlitz              |
| `file`        | `string`                              | Initial file to open in StackBlitz      |

## App-specific Configuration

These options can be set in the `package.json` of individual exercises to
override the global settings.

| Option             | Type                       | Description                                 |
| ------------------ | -------------------------- | ------------------------------------------- |
| `stackBlitzConfig` | `object` \| `null`         | Override or disable StackBlitz for this app |
| `testTab.enabled`  | `boolean`                  | Enable or disable the test tab for this app |
| `initialRoute`     | `string`                   | Set a custom initial route for this app     |
| `appType`          | `"standard"` \| `"export"` | Override the app type detection             |

## Export Apps

Export apps are a special type of app that displays console output and exported
values from your index file. This is useful for exercises where you want
students to see the results of their code without needing to manipulate the DOM
directly.

### How Export Apps Work

When an app is configured as an export app:

1. **Console Capture** - All `console.log`, `console.warn`, `console.error`,
   `console.info`, and `console.debug` calls are captured and displayed in the
   "Console Output" section of the preview
2. **Export Display** - All named exports from the `index.js` or `index.ts` file
   are pretty-printed in the "Exports" section with syntax highlighting

### Configuring Export Apps

There are two ways to configure export apps:

#### 1. Workshop-Level Configuration

Set `appType` to `"export"` in your root `package.json` to make ALL simple apps
into export apps:

```json
{
	"epicshop": {
		"title": "My Workshop",
		"appType": "export"
	}
}
```

This is useful when your entire workshop focuses on code that produces values
rather than UI (e.g., algorithm workshops, data transformation workshops).

#### 2. Per-App Configuration

Set `appType` to `"export"` in the app's `package.json`:

```json
{
	"name": "my-export-exercise",
	"epicshop": {
		"appType": "export"
	}
}
```

Note: Per-app configuration takes precedence over workshop-level configuration.
You can also use `"appType": "standard"` to opt out of export behavior when the
workshop-level config is set to `"export"`.

### Example Export App

Here's an example of what an export app's `index.ts` might look like:

```typescript
// A function that doubles each number in an array
export function doubleNumbers(numbers: number[]): number[] {
	return numbers.map((n) => n * 2)
}

// Test the function
const input = [1, 2, 3, 4, 5]
console.log('Input:', input)

// Export the result
export const result = doubleNumbers(input)
console.log('Result:', result)

// Export additional values to demonstrate the display
export const config = {
	name: 'Export App Demo',
	version: 1,
}
```

The preview will show:

- **Console Output**: The logged messages with type labels (LOG, WARN, etc.)
- **Exports**: Pretty-printed values of `doubleNumbers`, `result`, and `config`

### When to Use Export Apps

Export apps are ideal for:

- Data transformation exercises
- Algorithm implementation
- Array and object manipulation
- Any exercise where the result is a value rather than UI

They're not recommended for:

- DOM manipulation exercises (use simple apps instead)
- Interactive UI exercises (use complex apps with a dev server)

## Example Configuration

Here's an example of some configuration in the root `package.json`:

```
{
  "epicshop": {
    "title": "Advanced React Patterns",
    "subtitle": "Master complex React patterns",
    "subdomain": "react-patterns",
    "instructor": {
      "name": "Kent C. Dodds",
      "avatar": "/images/instructor.png",
      "𝕏": "kentcdodds"
    },
    "product": {
      "displayName": "EpicReact.dev",
      "displayNameShort": "Epic React",
      "logo": "/images/logo.svg"
    },
    "githubRepo": "https://github.com/epicweb-dev/advanced-react-patterns",
    "stackBlitzConfig": {
      "view": "editor",
      "file": "src/App.tsx"
    },
    "forms": {
      "workshop": "https://docs.google.com/forms/d/e/1FAIpQLSdRmj9p8-5zyoqRzxp3UpqSbC3aFkweXvvJIKes0a5s894gzg/viewform?hl=en&embedded=true&entry.2123647600={workshopTitle}",
      "exercise": "https://docs.google.com/forms/d/e/1FAIpQLSf3o9xyjQepTlOTH5Z7ZwkeSTdXh6YWI_RGc9KiyD3oUN0p6w/viewform?hl=en&embedded=true&entry.1836176234={workshopTitle}&entry.428900931={exerciseTitle}"
    },
    "testTab": {
      "enabled": true
    },
    "scripts": {
      "postupdate": "npm run build"
    },
    "initialRoute": "/welcome"
  }
}
```

### Workshop Notifications

You can define custom notifications for your workshop using the `notifications`
array in your `epicshop` config. These notifications are always shown to users
of your workshop (unless expired or muted), and are not subject to product
filtering like
[remote notifications](https://gist.github.com/kentcdodds/c3aaa5141f591cdbb0e6bfcacd361f39).

Each notification object can have the following fields:

| Field       | Type   | Description                                                       |
| ----------- | ------ | ----------------------------------------------------------------- |
| `id`        | string | Unique identifier for the notification.                           |
| `title`     | string | The notification title.                                           |
| `message`   | string | The notification message.                                         |
| `type`      | string | One of `info`, `warning`, or `danger`.                            |
| `link`      | string | (Optional) A URL for users to learn more.                         |
| `expiresAt` | date   | (Optional) A date after which the notification will not be shown. |

**Note:**

- Notifications defined in your workshop config are always included for your
  users, regardless of the current product host/slug.
- If `expiresAt` is set and is in the past, the notification will not be shown.
- If a user mutes a notification, it will not be shown again for that user.
- These notifications are merged with any remote notifications (such as those
  from the Epicshop notification gist).

#### Example

```json
{
	"epicshop": {
		// ...other config...
		"notifications": [
			{
				"id": "custom-welcome",
				"title": "Welcome to the Workshop!",
				"message": "We're glad you're here. Check out the resources tab for more info.",
				"type": "info"
			},
			{
				"id": "new-feature",
				"title": "New Feature",
				"message": "We've added a new feature to the workshop. Check it out in the resources tab.",
				"link": "https://www.epicweb.dev/new-feature",
				"type": "info",
				"expiresAt": "2025-07-01"
			}
		]
	}
}
```
