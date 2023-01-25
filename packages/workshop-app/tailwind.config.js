const defaultTheme = require('tailwindcss/defaultTheme')

/** @type {import('tailwindcss').Config} */
module.exports = {
	content: ['./app/**/*.{ts,tsx,jsx,js}'],
	theme: {
		extend: {
			fontFamily: {
				sans: ['Space Grotesk', ...defaultTheme.fontFamily.sans],
				mono: ['Azeret Mono', ...defaultTheme.fontFamily.mono],
			},
		},
	},
	plugins: [require('@tailwindcss/typography')],
}
