const defaultTheme = require('tailwindcss/defaultTheme')
const colors = require('tailwindcss/colors')

/** @type {import('tailwindcss').Config} */
module.exports = {
	content: ['./app/**/*.{ts,tsx,jsx,js}', '../example/**/*.md'],
	theme: {
		extend: {
			fontFamily: {
				sans: ['Neogrotesk', ...defaultTheme.fontFamily.sans],
				mono: ['IBM Plex Mono', ...defaultTheme.fontFamily.mono],
			},
			colors: {
				gray: colors.neutral,
			},
		},
	},
	plugins: [
		require('@tailwindcss/typography')({
			skip: ['#files'],
		}),
		require('tailwindcss-radix'),
		require('tailwind-scrollbar'),
	],
}
