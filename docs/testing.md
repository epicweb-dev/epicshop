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
