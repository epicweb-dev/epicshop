# Diff

The diff tab makes a huge difference (no pun intended 😆) for learners going
through your material. It helps them get unstuck if they get totally stuck. This
is especially useful in a self-paced setting, but even when you're delivering
the workshop, sometimes it's just a mispelling or something that's causing
issues and the diff tab can help learners see that before they have to interrupt
you.

The way it works is a little complicated because we want to use `git` to
generate the diff, but we want to make sure we only include the files necessary
and exclude anything that would be distracting to the learner (like changes to
the `README.mdx` instructions, or the `package.json` files). Additionally, we
don't want to compare files that you _know_ won't be different and they won't
need to touch (like a big json file full of data that they're supposed to use)
because that would be wasteful and slow things down.

Because of this, we can't just run `git diff --no-index` on the directories in
question because that would include all the files which could be very slow.

Instead, it's much faster to copy the files over to a temporary directory
(filtering out the ones we want to ignore) and then run the diff on those
temporary directories. This may seem counter-intuitive, but it's definitely
faster and more reliable.

## Cache

Because the diffs are pretty expensive, we load them asynchronously (streamed to
the browser) and cache the result. Whenever a file is changed in one of the
directories, the cache is invalidated and the diff will be re-generated the next
time it's requested.

As with most things that are cached, you can force a fresh version by adding
`?fresh` to the URL. This is useful for testing and for when you know that the
cache is stale. This could happen if you change the ignore patterns.

## Customizing the ignored files

You normally shouldn't need to worry about this, because it works the way you
would expect. We filter anything out that's in the `.gitignore` file in the root
of the workshop repo or in the `.gitignore` file in the exercise directory. We
also filter out several other common files that are not relevant to the
exercise. `package.json` is only ignored if the only difference is the `name`
property, if there are other differences, it will be included in the diff.

If that's not enough, you can add a `epicshop/.diffignore` file to the root of
the workshop repo and/or in the exercise directory to ignore additional files.
You can even inverse the ignore by adding a `!` in front of the file pattern. So
if you really wanted to include the `package.json` for some reason, then you
could add `!package.json` to the `.diffignore` file. The order of the ignores is
important and works in the way you might expect. The one that comes later can
override the one that comes before it:

- Default ignores
- `.gitignore` in the root
- `epicshop/.diffignore` in the root
- `.gitignore` in the exercise directory
- `epicshop/.diffignore` in the exercise directory
