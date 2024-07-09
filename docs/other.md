# Other stuff

## `EPICSHOP_DISABLE_WATCHER`

By default, epicshop sets up file watchers for everything. In some situations
this maybe an issue due to the number files. This is disabled in the deployed
version, but you can also disable it locally by setting the
`EPICSHOP_DISABLE_WATCHER` environment variable to "true".

## Set to playground

Sometimes when the user sets the playground, you may have things you want to
accomplish before and after the playground is set. You can do this by adding a
`epicshop` directory in the root and a `pre-set-playground.js` and
`post-set-playground.js` file. This will be executed before and after the
playground is set.

If you have some specific behavior of a specific exercise, then you can do the
same within that exercise directory and that will be executed instead of the
root `epicshop` directory. If you want both to be run, simply import the root's
version of the script from within your script to have it be executed.

These will be provided with the following environment variables:

- `EPICSHOP_PLAYGROUND_TIMESTAMP`: A way to correlate the pre and post scripts.
- `EPICSHOP_PLAYGROUND_SRC_DIR`: The directory that is the source for the
  playground.
- `EPICSHOP_PLAYGROUND_DEST_DIR`: The directory that's the destination for the
  copy (the playground directory).
- `EPICSHOP_PLAYGROUND_WAS_RUNNING`: Whether the playground was running when the
  user set the playground.
- `EPICSHOP_PLAYGROUND_IS_STILL_RUNNING`: Whether the playground is still
  running after the user set the playground (available in the `post` script
  only)
- `EPICSHOP_PLAYGROUND_RESTART_PLAYGROUND`: Whether the playground will be
  restarted after the `post` script (available in the `post` script only).

These scripts will be run with the `cwd` set to the workshop root.

## Update

When the workshop app is started, it checks to see whether there are any updates
to the repository. If there are, it will show a message to the user that there
is an update available and will tell them to run `npx update-epic-workshop` to
update the workshop. If you want to run anything after the update, add a
`postupdate` script to `epicshop.scripts` in the root `package.json`:

```json
{
	"epicshop": {
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

For the time being, we're using Google Forms for the feedback and elaboration
bits at the end of each exercise and the end of the workshop.

You can customize the exercise and workshop feedback forms in the `package.json`
of the root of your workshop:

```json
{
	"epicshop": {
		"forms": {
			"workshop": "https://docs.google.com/forms/d/e/1FAIpQLSdRmj9p8-5zyoqRzxp3UpqSbC3aFkweXvvJIKes0a5s894gzg/viewform?hl=en&embedded=true&entry.2123647600={workshopTitle}",
			"exercise": "https://docs.google.com/forms/d/e/1FAIpQLSf3o9xyjQepTlOTH5Z7ZwkeSTdXh6YWI_RGc9KiyD3oUN0p6w/viewform?hl=en&embedded=true&entry.1836176234={workshopTitle}&entry.428900931={exerciseTitle}"
		}
	}
}
```

### Pre-filling the forms

Creating a feedback form for each exercise will quickly lead to you having
hundreds of forms! Instead, epicshop can take the same Google form URL and
pre-fill the `{exerciseTitle}` and `{workshopTitle}` tokens present in it with
the right exercise and workshop title.

For that to work, you have to **create a pre-filled form URL**. To do that, read
the "Send a form with pre-filled answers" in
[Send our your form](https://support.google.com/docs/answer/160000?co=GENIE.Platform%3DDesktop&hl=en).

1. Open your exercise/workshop feedback form on Google Forms;
1. Click on the vertical menu icon (three dots next to your avatar), choose "Get
   pre-filled link";
1. In the opened form, put the `{exerciseTitle}` and `{workshopTitle}` literal
   values into the right fields in your form;
1. At the bottom, click "Get link". A "COPY LINK" button will appear. Click it
   to copy the pre-filled URL. Use that URL in `package.json`.

Eventually we'll probably move to something more custom, but for now this works.

## Initial Route

When the learner clicks "start server" we wait for the server to be ready by
hitting it with `HEAD` requests. Once the server is ready, we load the `iframe`
at the route `/` by default. You can customize this with the `initialRoute`
property in the `package.json`:

```json
{
	"epicshop": {
		"initialRoute": "/some-other-route"
	}
}
```

You can do this globally by putting this configuration in the root of the
workshop or on a per-exercise basis by putting it in the exercise's
`package.json`.

## Meta data Customization

The deployed version of your workshop is a great way to market your workshop.
People will see the quality material and any paid videos in the material will
encourage people to buy the workshop. You can customize the meta data that is
used when the workshop is shared on social media by adding the following to the
`package.json`:

```json
{
	"epicshop": {
		"title": "Full Stack Foundations 🔭",
		"subtitle": "Learn how to build full-stack applications.",
		"instructor": {
			"name": "Kent C. Dodds",
			"avatar": "/images/instructor.png",
			"𝕏": "kentcdodds"
		}
	}
}
```

Make sure to place an image of you at `/pubic/images/instructor.png` that's at
least 112px by 112px in your workshop repo and of course update the name and 𝕏
handle to be your own.

## Site customization

If the workshop videos are hosted on a domain other than EpicWeb.dev, you can
customize this by adding the following to the `package.json`:

```json
{
	"epicshop": {
		"epicWorkshopHost": "www.epicreact.dev"
	}
}
```
