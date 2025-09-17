# Testing

The workshop app has testing support. By default the testing tab appears in the
following scenarios:

1. You have a `test` script in the `package.json` - A button will be presented
   to run the script and the output will be streamed in. Sometimes coloration
   can be funny in this case...
2. You have a `*.test.*` file in the root of the app - The test files will
   compiled, bundled, and loaded into the browser directly.

You can disable the tab by setting `epicshop.testTab.enabled` to false in the
`pacakge.json`:

```json
{
	"epicshop": {
		"testTab": {
			"enabled": false
		}
	}
}
```

You can do this globally in the root `package.json` or in an individual
exercise.

## In-browser tests

For simple apps, you can use the `@epic-web/workshop-utils/test` module to run
tests in the browser.

We run your tests in an iframe. For exercises that include an `index.html` file,
this automatically loads the same `indes.html` and simply adds a script for your
test file. For those which don't include a custom `index.html` file, one is
created for you and you can import the exercise file yourself. You communicate
with the parent app using `testStep` (this uses `postmessage` under the hood):

```ts
import { testStep, expect, dtl } from '@epic-web/workshop-utils/test'

import './index.tsx'

await testStep('The counter button should be rendered', async () => {
	expect(
		await dt.screen.findByRole('button', { name: /Click me please/i }),
	).toBeInTheDocument()
})
```

The `@epic-web/workshop-utils/test` module also exports a `dtl` object which is
the same as everything in `@testing-library/dom`. The `expect` export is the
same from `@vitest/expect` and it has the `@testing-library/jest-dom` matchers
already added as well.
