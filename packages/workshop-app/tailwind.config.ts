import typography from '@tailwindcss/typography'
import scrollbar from 'tailwind-scrollbar'
import { type Config } from 'tailwindcss'
import defaultTheme from 'tailwindcss/defaultTheme.js'
import animate from 'tailwindcss-animate'
import cssRadix from 'tailwindcss-radix'
import { extendedTheme } from './app/utils/extended-theme.ts'

export default {
	darkMode: ['class'],
	content: ['./app/**/*.{ts,tsx,jsx,js}', '../example/**/*.md'],
	theme: {
		container: {
			center: true,
			padding: '2rem',
			screens: {
				'2xl': '1400px',
			},
		},
		minWidth: {
			0: '0',
			md: '28rem',
			full: '100%',
		},
		extend: {
			...extendedTheme,
			fontFamily: {
				sans: ['var(--font-sans)', ...defaultTheme.fontFamily.sans],
				mono: ['var(--font-mono)', ...defaultTheme.fontFamily.mono],
			},
		},
	},
	plugins: [typography, cssRadix, scrollbar, animate],
} satisfies Config
