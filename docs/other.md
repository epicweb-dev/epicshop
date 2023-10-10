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

These scripts will be run with the `cwd` set to the workshop root.

## Update

When the workshop app is started, it checks to see whether there are any updates
to the repository. If there are, it will show a message to the user that there
is an update available and will tell them to run `npx kcdshop update` to update
the workshop. If you want to run anything after the update, add a `postupdate`
script to `kcd-workshop.scripts` in the root `package.json`:

```
"kcd-workshop": {
  "title": "Full Stack Foundations 🔭",
  "githubRoot": "https://github.com/epicweb-dev/full-stack-foundations/blob/main",
  "root": true,
  "epicWorkshopSlug": "full-stack-foundations",
  "scripts": {
    "postupdate": "echo '🎉🎉🎉'"
  }
}
```
