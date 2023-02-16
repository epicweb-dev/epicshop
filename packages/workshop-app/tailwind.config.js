const defaultTheme = require('tailwindcss/defaultTheme')

/** @type {import('tailwindcss').Config} */
module.exports = {
	content: ['./app/**/*.{ts,tsx,jsx,js}', '../example/**/*.md'],
	theme: {
		extend: {
			fontFamily: {
				sans: [...defaultTheme.fontFamily.sans],
				// sans: ['Space Grotesk', ...defaultTheme.fontFamily.sans],
				mono: ['Azeret Mono', ...defaultTheme.fontFamily.mono],
			},
			content: {
				tabStart: 'yo',
				tabEnd:
					"url('data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='15' height='10' viewBox='0 0 15 10'%3E%3Cpath fill='%23f9fafb' d='M0 0v10h15V8c-4.5 0-9-3.5-9-8H0Z'/%3E%3C/svg%3E%0A')",
			},
		},
	},
	plugins: [
		require('@tailwindcss/typography')({
			skip: ['#files'],
		}),
		require('tailwindcss-radix'),
	],
}
