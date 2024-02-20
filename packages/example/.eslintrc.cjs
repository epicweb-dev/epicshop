/**
 * @type {import('@types/eslint').Linter.BaseConfig}
 */
module.exports = {
	extends: ['kentcdodds'],
	parserOptions: {
		project: require.resolve('./scripts/tsconfig.json'),
		sourceType: 'module',
		ecmaVersion: 2023,
	},
}
