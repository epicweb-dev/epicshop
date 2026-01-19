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
