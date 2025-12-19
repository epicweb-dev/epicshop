# epicshop

The `epicshop` CLI installs, runs, and updates Epic Workshop repositories on
your machine.

It’s the recommended entry point for learners.

## Install

```bash
npm install -g epicshop
```

Or run without installing:

```bash
npx epicshop init
```

## Usage

### First-time setup

```bash
epicshop init
```

### Start a workshop

Inside a workshop directory:

```bash
epicshop start
```

Or start a specific workshop you’ve added:

```bash
epicshop start <workshop>
```

### Helpful commands

- `epicshop add <repo-name> [destination]`: clone a workshop from the
  `epicweb-dev` GitHub org
- `epicshop list`: list your workshops
- `epicshop open`: open a workshop in your editor
- `epicshop update`: pull the latest workshop changes
- `epicshop warm`: warm caches for faster workshop startup

## Environment variables

- `EPICSHOP_APP_LOCATION`: path to the `@epic-web/workshop-app` directory
- `EPICSHOP_EDITOR`: preferred editor for `epicshop open`
- `NODE_DEBUG`: debug logging (see repo docs)

## Programmatic usage

This package also exports ESM entrypoints:

```js
import { start } from 'epicshop/start'
import { update } from 'epicshop/update'
import { warm } from 'epicshop/warm'
```

## Documentation

- CLI docs: `https://github.com/epicweb-dev/epicshop/tree/main/docs/cli.md`
- Debug logging:
  `https://github.com/epicweb-dev/epicshop/tree/main/docs/debug-logging.md`

## License

GPL-3.0-only.
