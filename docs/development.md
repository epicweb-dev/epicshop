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
