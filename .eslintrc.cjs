/**
 * @type {import('@types/eslint').Linter.BaseConfig}
 */
module.exports = {
	extends: ['prettier'],
	rules: {
		'no-warning-comments': [
			'error',
			{ terms: ['FIXME'], location: 'anywhere' },
		],
	},
}
