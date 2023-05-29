import type { Config } from 'tailwindcss'
import defaultTheme from 'tailwindcss/defaultTheme.js'
import colors from 'tailwindcss/colors.js'
import typography from '@tailwindcss/typography'
import cssRadix from 'tailwindcss-radix'
import scrollbar from 'tailwind-scrollbar'

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

export default {
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
	plugins: [typography, cssRadix, scrollbar],
} satisfies Config
