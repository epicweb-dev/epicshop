# epicshop repo agents instructions

This is a monorepo with packages in the `packages` folder. The primary output is
a React Router v7 web app users run locally on their own machines. There's also
a MCP (Model Context Protocol) server users install in their AI Assistants and a
CLI used to run the app.

The app is a workshop learning environment called the Epic Workshop App. It's
installed in individual repositories which resemble the structure of the
`example` folder.

## Terms

- "exercise" - a learning topic
- "step" - a relatively atomic part of an exercise
- "problem" - the starting point for a step
- "solution" - the expected final state for a step

## Tools

- npm
- node.js
- eslint
- prettier
- typescript
- vitest
- vite
- zshy
- playwright
- nx
- react router

## Dev environment tips

- **Install dependencies first**: Make sure you've run `npm install` before
  running any scripts.
- All scripts use nx to automatically manage dependencies and build order:
  - Run the build for all packages with `npm run build` (nx handles dependency
    order automatically and it's cached so it's pretty fast)
  - Run lower-level tests with `npm run test`
  - Run higher-level tests with `npm run test:e2e` (uses playwright)
  - Run basic build, type checking, linting, and tests with `npm run validate`
- To run commands for specific packages (to avoid running the whole project),
  use nx directly:
  - Build a specific package: `nx run @epic-web/workshop-utils:build`
  - Type check a specific package: `nx run @epic-web/workshop-app:typecheck`
  - Lint a specific package: `nx run @epic-web/workshop-presence:lint`
  - Run multiple packages:
    `nx run-many --target build --projects @epic-web/workshop-utils,@epic-web/workshop-presence`
  - Nx will still handle dependencies automatically (e.g., building
    `@epic-web/workshop-app` will build `@epic-web/workshop-utils` first if
    needed)
- Find the CI plan in the .github/workflows folder.
- Commit your changes, then run the following and commit any changes that are
  made separately:
  - Run `npm run lint -- --fix` to fix linting errors
  - Run `npm run format` to fix formatting errors
  - Run `npm run validate` to run all tests and checks

## Docs

- The docs are in the `docs` folder. Please update them as features change or
  are added.
- Debug logging is available via `NODE_DEBUG` environment variable (see
  `docs/debug-logging.md`)

## Testing principles (summaries + snippets)

### Prefer `resolves` chaining for async expectations

Source: https://www.epicweb.dev/prefer-the-resolves-chaining

- Use `await expect(promise).resolves...` so failures attach to the matcher and
  can be swapped to `rejects` when you are asserting errors.
- Avoid `expect(await promise)` because a rejection throws before the matcher
  runs, which produces less precise failures.

```ts
await expect(loadUser()).resolves.toEqual({ id: 'user-123' })
await expect(loadUser({ id: 'missing' })).rejects.toThrow(/not found/i)
```

### Vitest browser mode vs Playwright

Source: https://www.epicweb.dev/vitest-browser-mode-vs-playwright

- Use Vitest browser mode for component/integration tests that run in a real
  browser and let you query the page via `vitest/browser`.
- Use Playwright for end-to-end flows across routes, storage, and network where
  full browser automation is required.

```ts
import { test, expect } from 'vitest'
import { page } from 'vitest/browser'
import { render } from 'react-dom'
import { Greeting } from './greeting'

test('displays the greeting message', async () => {
	render(<Greeting />)
	await expect.element(page.getByText('Hi, Kody!')).toBeVisible()
})
```

```ts
import { test, expect } from '@playwright/test'

test('checkout flow', async ({ page }) => {
	await page.goto('/')
	await page.getByRole('link', { name: /cart/i }).click()
	await expect(page).toHaveURL(/cart/)
})
```

### Better test setup with disposable objects

Source: https://www.epicweb.dev/better-test-setup-with-disposable-objects

- Bundle setup artifacts and cleanup together so each test controls its own
  lifecycle and avoids leaking state across tests.

```ts
import { cleanup, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'

function setup() {
	const user = userEvent.setup()
	render(<Form />)
	const dispose = () => cleanup()
	return { user, dispose }
}

test('submits the form', async () => {
	const { user, dispose } = setup()
	await user.click(screen.getByRole('button', { name: /save/i }))
	dispose()
})
```

### Aha testing

Source: https://kentcdodds.com/blog/aha-testing

- Capture the "aha" behavior you learned from a bug or requirement in a test
  name and assertion so the lesson stays encoded in the suite.

```ts
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'

test('shows a required error when email is missing', async () => {
	render(<SignupForm />)
	const user = userEvent.setup()
	await user.click(screen.getByRole('button', { name: /submit/i }))
	expect(screen.getByText(/email is required/i)).toBeVisible()
})
```

### Avoid nesting when you are testing

Source: https://kentcdodds.com/blog/avoid-nesting-when-youre-testing

- Prefer flat tests with explicit setup to keep intent clear and avoid cascading
  `beforeEach`/`describe` complexity.

```ts
function setup(items: string[]) {
	render(<List items={items} />)
	return screen.queryAllByRole('listitem')
}

test('renders no items', () => {
	expect(setup([])).toHaveLength(0)
})

test('renders provided items', () => {
	expect(setup(['a', 'b'])).toHaveLength(2)
})
```

### Incredible Vitest defaults

Source: https://www.epicweb.dev/incredible-vitest-defaults

- Start with Vitest defaults before adding config, since it already wires up
  TypeScript, Vite integration, watch mode, and fast parallel execution.

```ts
import { expect, test } from 'vitest'

test('formats currency', () => {
	expect(formatCurrency(1234)).toBe('$1,234.00')
})
```

### `toBeVisible` vs `toBeInTheDocument`

Source: https://www.epicweb.dev/tobevisible-or-tobeinthedocument

- Use `toBeVisible` when the user should see the element; use
  `toBeInTheDocument` when it should exist even if hidden.

```ts
import { render, screen } from '@testing-library/react'

render(<Settings />)
expect(screen.getByRole('dialog')).toBeVisible()
expect(screen.getByText(/advanced options/i)).toBeInTheDocument()
expect(screen.getByText(/advanced options/i)).not.toBeVisible()
```

## Code style

The code style guide can be found in
`node_modules/@epic-web/config/docs/style-guide.md` (once dependencies have been
installed). Only the most important bits are enforced by eslint.

### UI Components and Styling

- **Use semantic colors**: Always use semantic color classes from the theme
  (e.g., `text-foreground`, `bg-background`, `border-border`,
  `text-muted-foreground`) instead of hardcoded colors like `text-red-600`,
  `bg-white`, etc. This ensures proper dark mode support and consistent theming.
- **Icon-only buttons**: For small action buttons (edit, delete, etc.), create
  simple icon-only buttons without the clip-path styling. Use minimal padding
  and semantic colors for hover states.
- **Truncate long text**: Use Tailwind's `truncate` class for text that might
  overflow, especially in constrained layouts like tables or cards.

## Important Development Gotchas

### Module Imports and Client/Server Separation

- **Server-only modules**: Any module in `@epic-web/workshop-utils` with
  `.server` in the filename (e.g., `utils.server`, `cache.server`) is
  server-only and cannot be imported in client-side components. This will cause
  module resolution errors in the browser.

### Build Dependencies and Workspace Management

- **Nx handles build order automatically**: When you run build, typecheck, or
  lint commands (either via npm scripts or nx directly), nx automatically builds
  dependencies first based on the dependency graph. You don't need to manually
  manage build order.
- **Always build before testing**: After making code changes, always run the
  build process before starting the dev server to test changes, especially when
  working with client-side functionality.
