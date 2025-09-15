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
- tshy
- playwright
- nx
- react router

## Dev environment tips

- Run lower-level tests with `npm run test`
- Run higher-level tests with `npm run test:e2e` (uses playwright)
- Run basic build, type checking, linting, and tests with `npm run validate`
- Find the CI plan in the .github/workflows folder.
- Before committing:
  - Run `npm run lint -- --fix` to fix linting errors
  - Run `npm run format` to fix formatting errors
  - Run `npm run validate` to run all tests and checks

## Docs

- The docs are in the `docs` folder. Please update them as features change or
  are added.
- Debug logging is available via `NODE_DEBUG` environment variable (see `docs/debug-logging.md`)

## Code style

The code style guide can be found in
`node_modules/@epic-web/config/docs/style-guide.md` (once dependencies have been
installed). Only the most important bits are enforced by eslint.
