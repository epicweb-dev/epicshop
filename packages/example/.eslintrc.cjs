/**
 * @type {import('@types/eslint').Linter.Config}
 */
module.exports = {
	extends: ['kentcdodds'],
	parserOptions: {
		project: require.resolve('./scripts/tsconfig.json'),
		sourceType: 'module',
		ecmaVersion: 2023,
	},
}
