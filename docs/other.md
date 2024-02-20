# Other stuff

## `KCDSHOP_DISABLE_WATCHER`

By default, kcdshop sets up file watchers for everything. In some situations
this maybe an issue due to the number files. This is disabled in the deployed
version, but you can also disable it locally by setting the
`KCDSHOP_DISABLE_WATCHER` environment variable to "true".

## Set to playground

Sometimes when the user sets the playground, you may have things you want to
accomplish before and after the playground is set. You can do this by adding a
`kcdshop` directory in the root and a `pre-set-playground.js` and
`post-set-playground.js` file. This will be executed before and after the
playground is set.

If you have some specific behavior of a specific exercise, then you can do the
same within that exercise directory and that will be executed instead of the
root `kcdshop` directory. If you want both to be run, simply import the root's
version of the script from within your script to have it be executed.

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

```json
{
	"kcd-workshop": {
		"title": "Full Stack Foundations 🔭",
		"githubRoot": "https://github.com/epicweb-dev/full-stack-foundations/blob/main",
		"root": true,
		"epicWorkshopSlug": "full-stack-foundations",
		"scripts": {
			"postupdate": "echo '🎉🎉🎉'"
		}
	}
}
```

## Forms

For the time being, we're using Google forms for the feedback and elaboration
bits at the end of each exercise and the end of the workshop. You can customize
these in the `package.json` of the root of your workshop like so:

```json
{
	"kcd-workshop": {
		"forms": {
			"workshop": "https://docs.google.com/forms/d/e/1FAIpQLSdRmj9p8-5zyoqRzxp3UpqSbC3aFkweXvvJIKes0a5s894gzg/viewform?hl=en&embedded=true&entry.2123647600={workshopTitle}",
			"exercise": "https://docs.google.com/forms/d/e/1FAIpQLSf3o9xyjQepTlOTH5Z7ZwkeSTdXh6YWI_RGc9KiyD3oUN0p6w/viewform?hl=en&embedded=true&entry.1836176234={workshopTitle}&entry.428900931={exerciseTitle}"
		}
	}
}
```

Note that you can interpolate the `workshopTitle` and `exerciseTitle` into the
URL so the user doesn't have to fill it out themselves (makes it easier to
aggregate their feedback later).

Unfortunately the `entry.2390423` values are kinda hard to find. You get them by
creating a "Pre-filled URL" in the Google form and then you can see the values
in the URL that's given to you.
[Learn more](https://support.google.com/docs/answer/160000?co=GENIE.Platform%3DDesktop&hl=en).

Eventually we'll probably move to something more custom, but for now this works.
