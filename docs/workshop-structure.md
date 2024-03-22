# Workshop Structure

Let's look at an example workshop:

```
.
├── LICENSE.md
├── README.md
├── examples
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
├── kcdshop
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
- Example: A runnable project in the `examples` directory
- App: A runnable project in the workshop
- Problem: The App which is the initial state of an exercise step
- Solution: The App which is the final state of an exercise step
- Playground: A place where learners can play with the App

Workshops have many exercises, exercises have many steps, steps have a single
problem and a single solution.

Finally there's the `playground` directory. When a learner clicks "Set to
Playground" in the UI, it copies the contents of the App they want to play with
into the playground directory.

## App Types

There are two different types of apps:

- Simple
- Project

What distinguishes between a simple and a project app is whether or not the App
has a package.json with a `dev` script. If it does, it's a project app.
Otherwise it's a simple app. In the workshop app, when a learner is on an
exercise step, they'll be presented with tabs for the playground, problem, and
solution. The type of app determines what shows up in those tabs.

### Projects

If the app is a project, then the tab will show a "Start" button which will run
the `dev` script with a `PORT` env and create an iframe pointing to that port.

So if you want to display a project app, you'll need to have a `dev` script in
the `package.json` and it should start a server on the `PORT` env.

### Simple

If the app is a simple one, then the tab will show an iframe pointing to a
special route that will serve the simple files. If there is an `index.html` file
it will serve that file. You can reference any other file in the `index.html`
file and those will be served by the workshop app as well. TypeScript files can
also be referenced and they will be compiled on demand and served as JavaScript
to the browser.

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

NOTE: As the path to your app is dynamic, you'll want to rely on the `<base>`
that's added to the `index.html` file. For example:

```html
<base href="/app/exercises__sep__08.final__sep__01.solution/" />
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
