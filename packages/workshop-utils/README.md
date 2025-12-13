# @epic-web/workshop-utils

Shared utilities for the Epic Workshop ecosystem.

This package is primarily consumed by the Epic Workshop App, the `epicshop` CLI,
and related tooling. It exposes many **subpath exports** (for example
`@epic-web/workshop-utils/config.server`).

## Install

```bash
npm install @epic-web/workshop-utils
```

## Important: server-only modules

Any module with `.server` in the import path is **server-only** and must not be
imported into browser/client bundles.

Examples of server-only entrypoints:

- `@epic-web/workshop-utils/config.server`
- `@epic-web/workshop-utils/db.server`
- `@epic-web/workshop-utils/git.server`

## Common usage

### Initialize env (CLI/tools)

Some tools import the env initializer for side effects:

```js
import '@epic-web/workshop-utils/init-env'
```

### Small helpers

```js
import { getErrorMessage } from '@epic-web/workshop-utils/utils'

try {
	// ...
} catch (error) {
	console.error(getErrorMessage(error))
}
```

## What’s exported?

This package uses explicit subpath exports. The canonical list is the `exports`
map in `package.json`.

Repository:
`https://github.com/epicweb-dev/epicshop/tree/main/packages/workshop-utils/package.json`

## Documentation

- Repo docs: `https://github.com/epicweb-dev/epicshop/tree/main/docs`

## License

GPL-3.0-only.
