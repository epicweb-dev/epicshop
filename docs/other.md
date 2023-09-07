# Other stuff

## `KCDSHOP_DISABLE_WATCHER`

By default, kcdshop sets up file watchers for everything. In some situations
this maybe an issue due to the number files. This is disabled in the deployed
version, but you can also disable it locally by setting the
`KCDSHOP_DISABLE_WATCHER` environment variable to "true".

## Set to playground

Sometimes when the user sets the playground, you may have things you want to
accomplish before and after the playground is set. You can do this by adding a
`kcdshop` directory in the exercise step directory and a `pre-set-playground.js`
and `post-set-playground.js` file. This will be executed before and after the
playground is set.

These will be provided with the following environment variables:

- `KCDSHOP_PLAYGROUND_TIMESTAMP`: A way to correlate the pre and post scripts.
- `KCDSHOP_PLAYGROUND_SRC_DIR`: The directory that is the source for the
  playground.
- `KCDSHOP_PLAYGROUND_DEST_DIR`: The directory that's the destination for the
  copy (the playground directory).
- `KCDSHOP_PLAYGROUND_WAS_RUNNING`: Whether the playground was running when the
  user set the playground.
- `KCDSHOP_PLAYGROUND_IS_STILL_RUNNING`: Whether the playground is still running
  after the user set the playground (available in the `post` script only)
- `KCDSHOP_PLAYGROUND_RESTART_PLAYGROUND`: Whether the playground will be
  restarted after the `post` script (available in the `post` script only).

These scripts will also be run with the `cwd` set to the playground directory,
but the actual script run will be the absolute path to the script in the source
directory.
