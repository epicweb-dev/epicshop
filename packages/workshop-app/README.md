# @epic-web/workshop-app

The **Epic Workshop App** is the React Router v7 web application that powers the
local workshop experience (exercises, steps, diffs, videos, progress, etc.).

Most users should not interact with this package directly. It is typically
started and managed by the **`epicshop` CLI**.

## Install

This package is commonly installed indirectly.

- Recommended: install the CLI

```bash
npm install -g epicshop
```

- Optional: install the app globally so the CLI can resolve it via Node
  resolution

```bash
npm install -g @epic-web/workshop-app
```

## Usage

Start a workshop via the CLI:

```bash
epicshop start
```

If the CLI cannot locate the app, you can point it at a specific
checkout/install:

```bash
epicshop start --app-location /absolute/path/to/@epic-web/workshop-app
```

(or set `EPICSHOP_APP_LOCATION`).

## Development (this repo)

From the monorepo root:

```bash
npm install
npm run build --workspace=@epic-web/workshop-utils
npm run build --workspace=@epic-web/workshop-presence
npm run dev --workspace=@epic-web/workshop-app
```

## Documentation

- Repo docs: `https://github.com/epicweb-dev/epicshop/tree/main/docs`

## License

GPL-3.0-only.
