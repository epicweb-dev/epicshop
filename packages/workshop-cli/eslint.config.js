import defaultConfig from '@epic-web/config/eslint'

/** @type {import("eslint").Linter.Config} */
export default [
	{
		ignores: ['dist/**', 'vitest.config.ts'],
	},
	...defaultConfig,
]
