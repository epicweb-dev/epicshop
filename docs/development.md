# Development

[kcdshop](https://github.com/epicweb-dev/kcdshop) repository contains simplified
[example apps](https://github.com/epicweb-dev/kcdshop/tree/main/packages/example).<br/>
To test kcdshop with a real workshop app, set the `KCDSHOP_CONTEXT_CWD`
environment variable with the path of a workshop you have installed locally.

Unix example:
`KCDSHOP_CONTEXT_CWD=/Users/kentcdodds/code/epicweb-dev/data-modeling`

Windows PowerShell example:
`$env:KCDSHOP_CONTEXT_CWD='"C:\Users\kentcdodds\code\epicweb-dev\data-modeling"'`

Windows cmd example:
`set KCDSHOP_CONTEXT_CWD='"C:\Users\kentcdodds\code\epicweb-dev\data-modeling"'`

Make sure that if the path includes spaces, you wrap the path in quotes as shown
above (note the use of single quotes wrapping the double quotes!).

> Notice: On Windows, you must use a backslash `\`.

Then, you can run `npm run dev` from the same terminal.
