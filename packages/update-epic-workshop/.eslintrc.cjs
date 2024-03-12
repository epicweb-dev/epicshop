/**
 * @type {import('@types/eslint').Linter.Config}
 */
module.exports = {
	extends: ['kentcdodds'],
	parserOptions: {
		sourceType: 'module',
		ecmaVersion: 2023,
	},
	rules: {
		complexity: 'off',
		'vars-on-top': 'off',
		'no-var': 'off',
		'no-await-in-loop': 'off',
		'import/no-unresolved': 'off',
		'no-shadow': 'off',
		'one-var': 'off',
		'default-case': 'off',
		'no-inner-declarations': 'off',
		'no-negated-condition': 'off',
		'react/display-name': 'off',
			'warn',
			{
				prefer: 'type-imports',
				disallowTypeAnnotations: true,
				fixStyle: 'inline-type-imports',
			},
		],
		'import/no-duplicates': ['warn', { 'prefer-inline': true }],
		'import/consistent-type-specifier-style': ['warn', 'prefer-inline'],
		'import/order': [
			'warn',
			{
				alphabetize: { order: 'asc', caseInsensitive: true },
				groups: [
					'builtin',
					'external',
					'internal',
					'parent',
					'sibling',
					'index',
				],
			},
		],
	},
}
