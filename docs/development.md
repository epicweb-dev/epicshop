# Development

The [`workshop-app`](https://github.com/epicweb-dev/workshop-app) repository
already contains simplified
[example apps](https://github.com/epicweb-dev/workshop-app/tree/main/packages/example)
you can use while developing the workshop app itself.

To test the epic workshop app with a real workshop, set the
`EPICSHOP_CONTEXT_CWD` environment variable with the path of a workshop you have
installed locally. You can find examples of usage below.

## Unix

```sh
EPICSHOP_CONTEXT_CWD=/Users/kentcdodds/code/epicweb-dev/data-modeling npm run dev
```

## Windows PowerShell

```sh
$env:EPICSHOP_CONTEXT_CWD='"C:\Users\kentcdodds\code\epicweb-dev\data-modeling"'
npm run dev
```

> Note: On Windows, you must use backslashes `\`.

## Windows cmd

```sh
set EPICSHOP_CONTEXT_CWD='"C:\Users\kentcdodds\code\epicweb-dev\data-modeling"'
npm run dev
```

Make sure that if the path includes spaces, you wrap the path in quotes as shown
above (note the use of single quotes wrapping the double quotes!).

## Using Bun (experimental)

You can use Bun for installs, builds, and tests while continuing to run the app under Node.js.

- Install Bun:

```bash
curl -fsSL https://bun.sh/install | bash
```

- Install dependencies at the repo root (runs example postinstall via npm under the hood):

```bash
bun install
```

- Build packages in dependency order:

```bash
(cd packages/workshop-utils    && bun run build)
(cd packages/workshop-presence && bun run build)
(cd packages/workshop-app      && bun run build)
(cd packages/workshop-cli      && bun run build)
```

- Run tests with Vitest via Bun:

```bash
# prefer Vitest runner executed with bunx for compatibility
(cd packages/workshop-utils    && bunx vitest run)
(cd packages/workshop-cli      && bunx vitest run)
(cd packages/workshop-presence && bunx vitest run)
(cd packages/workshop-mcp      && bunx vitest run)
```

- Run the CLI with Bun (built output):

```bash
bun packages/workshop-cli/dist/esm/cli.js start
# or warm caches
bun packages/workshop-cli/dist/esm/cli.js warm
```

Notes:
- The dev and production server scripts in `@epic-web/workshop-app` still execute with Node.js (they use `node ./server/dev-server.js` and `node ./start.js`). This is intentional and compatible with using Bun for installs/builds/tests.
- If `bun test` fails on certain APIs (e.g., `vi.mocked`), use `bunx vitest run` as shown above.

## CI Workflows

This repository has two main CI workflows that run on pushes to `main`:

### Validate Workflow

- Runs linting, building, testing, and type checking
- Includes a release job that publishes packages to npm
- Only runs releases when on the latest commit to avoid conflicts

### Auto Format Workflow

- Runs Prettier and ESLint with `--fix` to automatically format code
- Commits any formatting changes with message "chore: cleanup 🧹"
- When changes are committed, triggers a new validation workflow run to ensure
  release happens on the formatted code

This design prevents race conditions where the release would fail due to
formatting changes committed after the validation started.
