/**
 * @type {import('@types/eslint').Linter.BaseConfig}
 */
module.exports = {
	extends: ['@remix-run/eslint-config', 'prettier'],
	rules: {
		'no-warning-comments': [
			'error',
			{ terms: ['FIXME'], location: 'anywhere' },
		],
	},
}
