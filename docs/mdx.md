# MDX

## Codeblocks

Code blocks can have several options. They all come from
[@kentcdodds/md-temp](https://npm.im/@kentcdodds/md-temp) (lol at the "-temp"
part of that 😆).

Here are all the options:

````
```tsx filename=app/filename.tsx nocopy nonumber remove=1,3-5 add=2,6-8 lines=3,9-12
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

### `DiffLink`

Link to diff route or diff preview, to show git diff between two examples app.

#### Props:

- `to`: string - search params on the form:
  `app1=EXERCISES_NAME&app2=EXERCISES_NAME`

- `app1`, `app2`: string | number - one of this format:

  - EXERCISES_NAME - `exercises__sep__01.nested-routing__sep__01.problem.outlet`
  - EXERCISENUMBERSTR/STEPNUMBERSTR.TYPE - `app1="02/02.problem"`
  - offset step - 0, ±1, ±2... `app1={1}` - next step, step are in order of
    problem,solution,problem,solution, `app1={0} app2={4}` if current step is
    from `01/01.problem` to `01/03.problem`

- `preview`: boolean

  - when true link to `?preview=diff&...`
  - when false link to diff route

- `children`: optional - default to
  `Go to Diff from: <code>APP1_STEP_NAME</code> to: <code>APP2_STEP_NAME</code>`

- `to` or `app1` & `app2` are required.

```
<DiffLink app1="02/01.solution" app2="02/02.problem">
  Go to Diff from: <code>01.problem.outlet</code> to: <code>01.solution.outlet</code>
</DiffLink>
```
