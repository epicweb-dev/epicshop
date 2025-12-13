import defaultConfig from '@epic-web/config/eslint'

/** @type {import("eslint").Linter.Config} */
export default [
	...defaultConfig,
	{
		ignores: ['**/playground/**'],
	},
	{
		rules: {
			// we leave unused vars around for the exercises
			'no-unused-vars': 'off',
			'@typescript-eslint/no-unused-vars': 'off',
			'vitest/no-import-node-test': 'off',
		},
	},
]
