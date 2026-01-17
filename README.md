# Epic Workshop (epicshop)

The **Epic Workshop** app (sometimes referred to as **epicshop**) is the local
workshop environment used for EpicWeb.dev workshops. It’s a React Router v7 app
that runs on your machine and provides a guided learning experience (exercises,
steps, diffs, videos, progress, etc.).

If you’re here because you want to _run a workshop_, you probably want the
**`epicshop` CLI**.

## Quick start (learners)

```bash
npx epicshop init
```

That interactive setup will:

- Choose where to store your workshops
- Clone and set up the `epicshop-tutorial`
- Start the workshop app

Once you’ve added a workshop you can run it from inside the workshop folder:

```bash
epicshop start
```

## Packages

This repository is a monorepo that publishes several npm packages:

- **`epicshop`** (`packages/workshop-cli`): CLI for installing/running/updating
  workshops.
- **`@epic-web/workshop-app`** (`packages/workshop-app`): the React Router
  workshop web app used by the CLI.
- **`@epic-web/workshop-utils`** (`packages/workshop-utils`): shared utilities
  used across the ecosystem.
- **`@epic-web/workshop-presence`** (`packages/workshop-presence`): presence
  schema + server helpers.
- **`@epic-web/workshop-mcp`** (`packages/workshop-mcp`): MCP server for AI
  assistants inside workshops.

## Documentation

The deeper docs live in `/docs`:

- CLI: `docs/cli.md`
- Workshop structure: `docs/workshop-structure.md`
- Configuration: `docs/configuration.md`
- MDX components: `docs/mdx.md`
- Diff system: `docs/diff.md`
- Video player: `docs/video-player.md`
- Testing: `docs/testing.md`
- Launch checklist: `docs/launch.md`
- Deployment: `docs/deployment.md`
- Development: `docs/development.md`
- Debug logging: `docs/debug-logging.md`
- Other features: `docs/other.md`

## Contributing

```bash
npm run setup
npm run validate
```

Useful scripts:

- `npm run lint` / `npm run format`
- `npm run test` (unit) / `npm run test:e2e` (playwright)

## Links

- EpicWeb.dev: `https://www.epicweb.dev/get-started`
- Repository: `https://github.com/epicweb-dev/epicshop`

## License

GPL-3.0-only (see `package.json`).
