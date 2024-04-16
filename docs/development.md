# Development

[workshop-app](https://github.com/epicweb-dev/workshop-app) repository contains
simplified
[example apps](https://github.com/epicweb-dev/workshop-app/tree/main/packages/example).<br/>
To test the epic workshop app with a real workshop, set the
`EPICSHOP_CONTEXT_CWD` environment variable with the path of a workshop you have
installed locally.

Unix example:
`EPICSHOP_CONTEXT_CWD=/Users/kentcdodds/code/epicweb-dev/data-modeling`

Windows PowerShell example:
`$env:EPICSHOP_CONTEXT_CWD='"C:\Users\kentcdodds\code\epicweb-dev\data-modeling"'`

Windows cmd example:
`set EPICSHOP_CONTEXT_CWD='"C:\Users\kentcdodds\code\epicweb-dev\data-modeling"'`

Make sure that if the path includes spaces, you wrap the path in quotes as shown
above (note the use of single quotes wrapping the double quotes!).

> Notice: On Windows, you must use a backslash `\`.

Then, you can run `npm run dev` from the same terminal.
