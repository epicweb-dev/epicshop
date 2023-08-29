import type { Config } from 'tailwindcss'
import defaultTheme from 'tailwindcss/defaultTheme.js'
import colors from 'tailwindcss/colors.js'
import typography from '@tailwindcss/typography'
import animate from 'tailwindcss-animate'
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

const removeCodeBackticks = {
	'code::before': {
		content: 'none',
	},
	'code::after': {
		content: 'none',
	},
}

const proseColors = {
	'*': {
		color: 'hsl(var(--foreground))',
	},
}

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
			fontFamily: {
				sans: ['var(--font-sans)', ...defaultTheme.fontFamily.sans],
				mono: ['var(--font-mono)', ...defaultTheme.fontFamily.mono],
			},
			typography: {
				DEFAULT: { css: [removeProseMargin, proseColors, removeCodeBackticks] },
				sm: { css: [removeProseMargin, proseColors, removeCodeBackticks] },
				base: { css: [removeProseMargin, proseColors, removeCodeBackticks] },
				lg: { css: [removeProseMargin, proseColors, removeCodeBackticks] },
				xl: { css: [removeProseMargin, proseColors, removeCodeBackticks] },
				'2xl': { css: [removeProseMargin, proseColors, removeCodeBackticks] },
			},
			colors: {
				gray: colors.neutral,
				border: 'hsl(var(--border))',
				input: 'hsl(var(--input))',
				ring: 'hsl(var(--ring))',
				background: 'hsl(var(--background))',
				foreground: 'hsl(var(--foreground))',
				'foreground-danger': 'hsl(var(--foreground-danger))',
				scrollbar: 'var(--scrollbar)',
				primary: {
					DEFAULT: 'hsl(var(--primary))',
					foreground: 'hsl(var(--primary-foreground))',
				},
				secondary: {
					DEFAULT: 'hsl(var(--secondary))',
					foreground: 'hsl(var(--secondary-foreground))',
				},
				destructive: {
					DEFAULT: 'hsl(var(--destructive))',
					foreground: 'hsl(var(--destructive-foreground))',
				},
				muted: {
					DEFAULT: 'hsl(var(--muted))',
					foreground: 'hsl(var(--muted-foreground))',
				},
				accent: {
					DEFAULT: 'hsl(var(--accent))',
					foreground: 'hsl(var(--accent-foreground))',
				},
				popover: {
					DEFAULT: 'hsl(var(--popover))',
					foreground: 'hsl(var(--popover-foreground))',
				},
				card: {
					DEFAULT: 'hsl(var(--card))',
					foreground: 'hsl(var(--card-foreground))',
				},
			},
			borderRadius: {
				lg: `var(--radius)`,
				md: `calc(var(--radius) - 2px)`,
				sm: 'calc(var(--radius) - 4px)',
			},
			keyframes: {
				'accordion-down': {
					from: { height: '0' },
					to: { height: 'var(--radix-accordion-content-height)' },
				},
				'accordion-up': {
					from: { height: 'var(--radix-accordion-content-height)' },
					to: { height: '0' },
				},
			},
			animation: {
				'accordion-down': 'accordion-down 0.2s ease-out',
				'accordion-up': 'accordion-up 0.2s ease-out',
			},
		},
	},
	plugins: [typography, cssRadix, scrollbar, animate],
} satisfies Config
