# Development

The [`workshop-app`](https://github.com/epicweb-dev/workshop-app) repository
already contains simplified
[extra apps](https://github.com/epicweb-dev/workshop-app/tree/main/packages/extra)
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

## Git hooks

This repo installs Git hooks automatically via Husky when you run `npm install`
because the root `prepare` script runs `husky`.

### Pre-commit

Every commit runs:

- `npm run format:staged` to format only staged files with Oxfmt via
  `lint-staged`
- `npm run lint`
- `npm run typecheck`
- `npm run build`

If a staged file is reformatted, lint-staged updates the staged copy before the
rest of the checks continue.

### Pre-push

Every push runs:

- `npm run test`

### Running the same checks manually

```sh
npm run precommit
npm run prepush
```

If you need to bypass hooks for an emergency local workflow, use Git's
`--no-verify` flag intentionally and sparingly.

## CI Workflows

This repository has two main CI workflows that run on pushes to `main`:

### Validate Workflow

- Runs linting, building, testing, and type checking
- Includes a release job that publishes packages to npm
- Only runs releases when on the latest commit to avoid conflicts

### Auto Format Workflow

- Runs Oxfmt and Oxlint with `--fix` to automatically format code
- Commits any formatting changes with message "chore: cleanup 🧹"
- When changes are committed, triggers a new validation workflow run to ensure
  release happens on the formatted code

This design prevents race conditions where the release would fail due to
formatting changes committed after the validation started.
