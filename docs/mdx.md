# MDX

## Codeblocks

Code blocks can have several options. They all come from
[@kentcdodds/md-temp](https://npm.im/@kentcdodds/md-temp) (lol at the "-temp"
part of that 😆).

Here are all the options:

````
```tsx filename=app/filename.tsx nocopy nonumber remove=1,3-5 add=2,6-8 highlight=3,9-12
// line
// line
// line
// line
// line
// line
// line
// line
// line
// line
// line
// line
// line
```
````

Hopefully that gives you an idea.

Code with `sh` as the language will not get line numbers automatically. This is
maybe a mistake, so add `nonumber` because I'll probably change this eventually.

## Callouts

There are several types of callouts:

- `<callout-muted>` - gray
- `<callout-info>` - blue
- `<callout-warning>` - yellow
- `<callout-danger>` - red
- `<callout-success>` - green

You can also add `class` to these:

- `class="aside"` - Makes the text smaller.
- `class="important"` - Makes the text bigger and bold.
- `class="notification"` - allows you to add a title with
  `<div className="title">This is the title</div>`. Applies only to warning and
  danger currently.

## Components

There are a few handy components you can use in the MDX files:

### `InlineFile`

Display a link to open a file:

```mdx
<InlineFile file="app/root.tsx" />
```

By default the text is just the filepath, but you can customize it as well:

```mdx
<InlineFile file="app/root.tsx">Open root.tsx</InlineFile>
```

### `LinkToApp`

Link to a page within the running app:

```mdx
<LinkToApp to="/dashboard" />
```

By default the text is just the path, but you can customize it as well:

```mdx
<LinkToApp to="/dashboard">Go to the dashboard</LinkToApp>
```

It's also got all the props a regular React Router `Link` has, so you can use
`reloadDocument` if you're linking to a resource route or something.

### `CodeFile`

Display contents of a file:

```mdx
<CodeFile
	file="app/entry.server.tsx"
	range="1-8,10-20"
	highlight="1-2,15-17"
	nocopy
	nonumber
	buttons="problem,solution,playground"
/>
```

This will keep track of the code in the file and let you know when it changes
with a callout notification so you can update the props.
