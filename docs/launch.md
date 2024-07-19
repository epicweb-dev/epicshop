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

You must also add the `epicWorkshopSlug` to the `epicshop` section in
`package.json`:

```json
{
	"epicshop": {
		"epicWorkshopSlug": "full-stack-foundations"
	}
}
```

The `epicWorkshopSlug` is used to fetch the workshop data from the `epicweb.dev`
API and is necessary for progress tracking.
