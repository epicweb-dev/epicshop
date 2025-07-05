import defaultConfig from '@epic-web/config/eslint'

/** @type {import("eslint").Linter.Config} */
export default [
	{
		ignores: [
			'**/.nx/**',
			// not sure what's up with this one
			'playwright.config.ts',
			'**/.react-router/**',
			'**/example/playground/**',
		],
	},
	...defaultConfig,
]
