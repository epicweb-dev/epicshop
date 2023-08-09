# Other stuff

## `KCDSHOP_DISABLE_WATCHER`

By default, kcdshop sets up file watchers for everything. In some situations
this maybe an issue due to the number files. This is disabled in the deployed
version, but you can also disable it locally by setting the
`KCDSHOP_DISABLE_WATCHER` environment variable to "true".
