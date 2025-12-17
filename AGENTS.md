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

- Run lower-level tests with `npm run test`
- Run higher-level tests with `npm run test:e2e` (uses playwright)
- Run basic build, type checking, linting, and tests with `npm run validate`
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

- **Build order matters**: In this monorepo, you must build workspace
  dependencies before building the main app:
  1. `npm run build --workspace=@epic-web/workshop-utils`
  2. `npm run build --workspace=@epic-web/workshop-presence`
  3. `npm run build --workspace=@epic-web/workshop-app`
- **Always build before testing**: After making code changes, always run the
  build process before starting the dev server to test changes, especially when
  working with client-side functionality.
