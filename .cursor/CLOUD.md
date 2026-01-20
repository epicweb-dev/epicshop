# Epic Workshop Development Guide

## Overview

Epic Workshop (epicshop) is a React Router v7 monorepo providing a local
learning environment for EpicWeb.dev workshops.

## Services

| Service           | Port                  | Command       | Notes                                                     |
| ----------------- | --------------------- | ------------- | --------------------------------------------------------- |
| Workshop App      | 5639+ (auto-assigned) | `npm run dev` | Main web UI, runs from `example/` directory               |
| Sidecar processes | Various               | Auto-started  | Workshop-specific, defined in `epicshop.sidecarProcesses` |

## Key Commands

| Task            | Command            |
| --------------- | ------------------ |
| Build all       | `npm run build`    |
| Lint            | `npm run lint`     |
| Format          | `npm run format`   |
| Unit tests      | `npm run test`     |
| E2E tests       | `npm run test:e2e` |
| Dev server      | `npm run dev`      |
| Full validation | `npm run validate` |

## Architecture Notes

- **Nx orchestration**: All build/test/lint commands use nx for automatic
  dependency ordering and caching
- **Server-only modules**: Files with `.server` suffix in
  `@epic-web/workshop-utils` are server-only and cannot be imported in client
  components
- **Always build before testing**: Run `npm run build` before `npm run dev` when
  testing client-side changes
- **Port auto-assignment**: The app starts on port 5639 by default but will
  auto-find an available port if occupied

## Package Structure

- `epicshop` (packages/workshop-cli): CLI tool
- `@epic-web/workshop-app` (packages/workshop-app): Main React Router app
- `@epic-web/workshop-utils` (packages/workshop-utils): Shared server utilities
- `@epic-web/workshop-presence` (packages/workshop-presence): Optional real-time
  presence
- `@epic-web/workshop-mcp` (packages/workshop-mcp): MCP server for AI assistants

## Testing Approach

- Unit tests use vitest and cover CLI, utils, presence, and MCP packages
- E2E tests use Playwright and test against the `example/` workshop
- For UI changes, test manually via `npm run dev` and browser

## Agent Workflow

- If you discover improvements that are unrelated to your current change, first
  search closed issues to see if the idea was already decided against, then open
  a new GitHub issue with a concise problem, proposal, and acceptance criteria.

## Common Issues

- If changes aren't reflected, ensure you've run `npm run build` first
- The TESTS tab in the UI requires authentication to use
