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

- `epicshop add <repo-name[#ref]> [destination]`: clone a workshop from the
  `epicweb-dev` GitHub org (use `#` to pin a tag, branch, or commit)
- `epicshop list`: list your workshops
- `epicshop open`: open a workshop in your editor
- `epicshop update`: pull the latest workshop changes
- `epicshop warm`: warm caches for faster workshop startup
- `epicshop cleanup`: select what to delete (workshops, caches, offline videos,
  prefs, auth, config)
- `epicshop exercises`: list exercises with progress (context-aware)
- `epicshop playground`: view, set, or restore saved playgrounds (context-aware)
- `epicshop progress`: view or update your progress (context-aware)
- `epicshop diff`: show diff between playground and solution (context-aware)

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
import { cleanup } from 'epicshop/cleanup'
import {
	show,
	set,
	listSavedPlaygrounds,
	setSavedPlayground,
	selectAndSetSavedPlayground,
} from 'epicshop/playground'
import {
	show as showProgress,
	update as updateProgress,
} from 'epicshop/progress'
import { showProgressDiff, showDiffBetweenApps } from 'epicshop/diff'
import { list, showExercise } from 'epicshop/exercises'
import { status, login, logout } from 'epicshop/auth'
```

## Documentation

- CLI docs: `https://github.com/epicweb-dev/epicshop/tree/main/docs/cli.md`
- Debug logging:
  `https://github.com/epicweb-dev/epicshop/tree/main/docs/debug-logging.md`

## License

GPL-3.0-only.
