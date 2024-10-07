// this is here to solve this issue: https://github.com/epicweb-dev/epicshop/issues/226
// we're using referrer to know which app is requesting the script. Works pretty well!
export * from './app.$appName+/epic_ws[.js].ts'
