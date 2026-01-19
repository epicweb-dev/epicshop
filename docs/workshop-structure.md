# Workshop Structure

Let's look at an example workshop:

```
.
├── LICENSE.md
├── README.md
├── extra
│   └── htmly-thing
│       └── index.html
├── exercises
│   ├── 01.composition
│   │   ├── 01.problem.reuse
│   │   │   ├── README.mdx
│   │   │   ├── index.tsx
│   │   │   ├── reset.d.ts
│   │   │   └── tsconfig.json
│   │   ├── 01.solution.reuse
│   │   │   ├── README.mdx
│   │   │   ├── index.tsx
│   │   │   ├── reset.d.ts
│   │   │   └── tsconfig.json
│   │   ├── 02.problem.props
│   │   │   ├── README.mdx
│   │   │   ├── index.tsx
│   │   │   ├── reset.d.ts
│   │   │   └── tsconfig.json
│   │   ├── 02.solution.props
│   │   │   ├── README.mdx
│   │   │   ├── index.tsx
│   │   │   ├── reset.d.ts
│   │   │   └── tsconfig.json
│   │   └── README.mdx
│   ├── 02.code-splitting
│   │   ├── 01.problem.lazy
│   │   │   ├── README.mdx
│   │   │   ├── index.html
│   │   │   ├── package.json
│   │   │   ├── public
│   │   │   │   ├── favicon.ico
│   │   │   │   ├── favicon.png
│   │   │   │   └── favicon.svg
│   │   │   ├── src
│   │   │   │   ├── countries-110m.json
│   │   │   │   ├── globe.tsx
│   │   │   │   ├── index.css
│   │   │   │   ├── index.tsx
│   │   │   │   ├── reset.d.ts
│   │   │   │   └── vite-env.d.ts
│   │   │   ├── tsconfig.json
│   │   │   └── vite.config.ts
│   │   ├── 01.solution.lazy
│   │   │   ├── README.mdx
│   │   │   ├── index.html
│   │   │   ├── package.json
│   │   │   ├── public
│   │   │   │   ├── favicon.ico
│   │   │   │   ├── favicon.png
│   │   │   │   └── favicon.svg
│   │   │   ├── src
│   │   │   │   ├── countries-110m.json
│   │   │   │   ├── globe.tsx
│   │   │   │   ├── index.css
│   │   │   │   ├── index.tsx
│   │   │   │   ├── reset.d.ts
│   │   │   │   └── vite-env.d.ts
│   │   │   ├── tsconfig.json
│   │   │   └── vite.config.ts
│   │   └── README.mdx
│   └── README.mdx
├── epicshop
│   ├── package-lock.json
│   ├── package.json
│   ├── playwright.config.ts
│   ├── setup-custom.js
│   ├── tests
│   │   └── in-browser-tests.spec.ts
│   └── tsconfig.json
├── package-lock.json
├── package.json
├── playground
│   ├── README.mdx
│   ├── index.tsx
│   ├── reset.d.ts
│   └── tsconfig.json
├── reset.d.ts
├── scripts
│   ├── deployed
│   │   ├── Dockerfile
│   │   ├── fly.toml
│   │   ├── package.json
│   │   └── setup-swap.js
│   ├── fix-watch.js
│   ├── fix.js
│   ├── nuke.js
│   ├── setup-custom.js
│   ├── setup.js
│   ├── tsconfig.json
│   └── update-deps.sh
├── setup.js
└── tsconfig.json
```

Let's define a few terms:

- Workshop App: The software people run to learn from the workshop
- Workshop: the entire project
- Exercise: each directory in the `exercises` directory
- Exercise Step: each subdirectory in an exercise directory
- Extra: A runnable project in the `extra` directory
- App: A runnable project in the workshop
- Problem: The App which is the initial state of an exercise step
- Solution: The App which is the final state of an exercise step
- Playground: A place where learners can play with the App

Workshops have many exercises, exercises have many steps, steps have a single
problem and a single solution.

Extras can include a top-level `extra/README.mdx` which powers the Extras page
in the workshop app. Each extra directory should also include its own
`README.mdx`, which renders on the extra detail page. For backwards
compatibility, the workshop app will fall back to legacy `example/` or
`examples/` directories when `extra/` is missing.

Finally there's the `playground` directory. When a learner clicks "Set to
Playground" in the UI, it copies the contents of the App they want to play with
into the playground directory. When playground persistence is enabled in
Preferences, each set also saves a timestamped copy in `saved-playgrounds`.
Learners can restore one of these copies from the playground chooser by
selecting "Saved playgrounds".

## App Types

There are four different types of apps:

- Simple
- Export
- Project
- Non-UI

The type of app is determined by the presence of a `package.json` file and its
contents:

- **No `package.json`** → Simple app (served by the workshop app)
- **No `package.json` + configured as export** → Export app (displays console
  output and exports)
- **`package.json` with a `dev` script** → Project app (runs its own dev server)
- **`package.json` without a `dev` script** → Non-UI exercise (no preview)

In the workshop app, when a learner is on an exercise step, they'll be presented
with tabs for the playground, problem, and solution. The type of app determines
what shows up in those tabs.

### Projects

If the app is a project, then the tab will show a "Start" button which will run
the `dev` script with a `PORT` env and create an iframe pointing to that port.

So if you want to display a project app, you'll need to have a `dev` script in
the `package.json` and it should start a server on the `PORT` env.

### Simple

If the app is a simple one (no `package.json`), then the tab will show an iframe
pointing to a special route that will serve the simple files. If there is an
`index.html` file it will serve that file. You can reference any other file in
the `index.html` file and those will be served by the workshop app as well.
TypeScript files can also be referenced and they will be compiled on demand and
served as JavaScript to the browser.

However, if your `index.html` doesn't need anything special, you can omit that
file altogether and instead create an `index.tsx` (or `.js` or `.ts`) file and
an `index.html` will be generated on-demand for you. In this case you can also
have an `index.css` file and that will be included in the generated `index.html`
file as well.

Another thing you can do with a simple app is create an `api.server.ts` (or
`.tsx` or `.js` or `.jsx`) file which exports a `loader` and/or `action`
function. This will be compiled and then dynamically imported by the workshop
app any time there is a request to `api` from the simple app. You can treat the
`loader` and `action` functions as if they're Remix loader and actions functions
(because they are basically).

Keep in mind that these are all served from the workshop app, so you don't
really get isolation from the workshop app which could potentially cause some
surprises. If you need something more powerful, then upgrade to a project app
instead of the simple app.

### Export

Export apps are a variant of simple apps designed for exercises where the output
is values rather than UI. They're configured via either glob patterns in the
root `package.json` or per-app configuration.

When an app is configured as an export app, the preview panel shows two
sections:

1. **Console Output**: Captures all `console.log`, `console.warn`,
   `console.error`, `console.info`, and `console.debug` calls with color-coded
   type labels
2. **Exports**: Pretty-prints all named exports from the index file with syntax
   highlighting for different value types

To configure apps as export apps, see the
[Export Apps configuration documentation](./configuration.md#export-apps).

Export apps are ideal for:

- Data transformation exercises
- Algorithm implementation
- Array and object manipulation
- Any exercise where the result is a value rather than UI

### Non-UI

If the app has a `package.json` but no `dev` script, it's considered a non-UI
exercise. The preview tab will display a "Non-UI exercise" message instructing
the learner to navigate to the playground directory in their editor and follow
the exercise instructions manually (e.g., running `node` commands in the
terminal).

NOTE: As the path to your app is dynamic, you'll want to rely on the `<base>`
that's added to the `index.html` file. For example:

```html
<base href="/app/08.01.solution/" />
```

This means that when you make a fetch request to `/api`, you need to do this:

```diff
- fetch('/api/whatever')
+ fetch('api/whatever')
```

This will handle the dynamic pathing for you.

## Running tests

Tests are tricky and don't entirely work well yet. But there is a test tab. Once
I get around to making this work more reliably then I'll update these docs for
how the testing structure works.
