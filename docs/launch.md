# Launching an Epic Web Workshop

The workshop is considered launched when you add videos to all the exercises.
There should be a video for each of these:

- Introduction (`exercises/README.mdx`)
  - Exercise Intro (`exercises/**.title/README.mdx`)
    - Step Problem (`exercises/**.title/**.problem/README.mdx`)
    - Step Solution (`exercises/**.title/**.solution/README.mdx`)
  - Exercise Summary (`exercises/**.title/FINISHED.mdx`)
- Wrap up (`exercises/FINISHED.mdx`)

These videos should be published on epicweb.dev and embedded via the `EpicVideo`
component.

```mdx
<EpicVideo url="https://www.epicweb.dev/workshops/full-stack-foundations/styling/intro-to-full-stack-foundations-workshop" />
```

To validate launch readiness locally, run:

`npx epicshop admin launch-readiness`

To auto-set workshop videos from the current product lesson order, run:

`npx epicshop admin set-videos`

This command only inserts/updates the `EpicVideo` directly below the file title,
and leaves any additional `EpicVideo` components in the file unchanged. Use
`--dry-run` to preview what would change without writing files.

You must also add the `product.slug` and `product.host` to the `epicshop`
section in `package.json`:

```json
{
	"epicshop": {
		"product": {
			"slug": "full-stack-foundations",
			"host": "www.epicweb.dev"
		}
	}
}
```

The `product.slug` and `product.host` are used to fetch the workshop data from
the `epicweb.dev` API and are necessary for progress tracking.

Check out the [configuration](./configuration.md) page for more information.

## Discord chat

### `discordChannelId`

The `product.discordChannelId` should point to the ID of the Discord form channel
associated with the workshop (e.g. "Epic Web", "Epic AI", etc).

<img width="666" height="564" alt="Screenshot 2026-05-07 at 16 39 33" src="https://github.com/user-attachments/assets/0a6fd25a-cbd2-4569-a897-1ab949f34382" />

> ![IMPORTANT]
> You can extract the channel ID from the URL when you have
> that channel open in Discord. For example:
> ```
> https://discord.com/channels/715220730605731931/1161045224907341972
>                                                 ^^^ Channel ID
> ```

### `discordTags`

The `product.discordTags` contains an array of tags relevant to the workshop.

<img width="1524" height="668" alt="Screenshot 2026-05-07 at 16 39 45" src="https://github.com/user-attachments/assets/8aa7dac8-47a8-44e1-b9c5-6db9de0bc847" />

> ![IMPORTANT]
> You can extract the tag ID by inspecting the respective IDs with DevTools.
> Use `1161046174439063593` as the reference for the "general" tag.

For example, `1161046174439063593`, is the "general" Epic Web tag.

If your workshop doesn't have an existing tag to apply to, please create a new one.

1. Right-click on the form channel (e.g. "Epic Web").
2. Edit channel.
3. Overview > Tags.
4. Click the "+" icon.
5. Provide a short and descriptive tag name and choose an emoji icon.
