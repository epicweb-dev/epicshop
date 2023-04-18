const defaultTheme = require('tailwindcss/defaultTheme')
const colors = require('tailwindcss/colors')

const removeProseMargin = {
	'> ul > li > *:first-child': {
		marginTop: 'unset',
	},
	'> ul > li > *:last-child': {
		marginBottom: 'unset',
	},
	'> ol > li > *:first-child': {
		marginTop: 'unset',
	},
	'> ol > li > *:last-child': {
		marginBottom: 'unset',
	},
}

/** @type {import('tailwindcss').Config} */
module.exports = {
	content: ['./app/**/*.{ts,tsx,jsx,js}', '../example/**/*.md'],
	theme: {
		minWidth: {
			0: '0',
			md: '28rem',
			full: '100%',
		},
		extend: {
			fontFamily: {
				sans: ['Neogrotesk', ...defaultTheme.fontFamily.sans],
				mono: ['IBM Plex Mono', ...defaultTheme.fontFamily.mono],
			},
			colors: {
				gray: colors.neutral,
			},
			typography: {
				DEFAULT: { css: [removeProseMargin] },
				sm: { css: [removeProseMargin] },
				base: { css: [removeProseMargin] },
				lg: { css: [removeProseMargin] },
				xl: { css: [removeProseMargin] },
				'2xl': { css: [removeProseMargin] },
			},
		},
	},
	plugins: [
		require('@tailwindcss/typography'),
		require('tailwindcss-radix'),
		require('tailwind-scrollbar'),
	],
}
