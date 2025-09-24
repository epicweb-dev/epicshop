import { type Config } from 'tailwindcss'

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

export const extendedTheme = {
	typography: {
		DEFAULT: { css: [removeProseMargin, proseColors, removeCodeBackticks] },
		sm: { css: [removeProseMargin, proseColors, removeCodeBackticks] },
		base: { css: [removeProseMargin, proseColors, removeCodeBackticks] },
		lg: { css: [removeProseMargin, proseColors, removeCodeBackticks] },
		xl: { css: [removeProseMargin, proseColors, removeCodeBackticks] },
		'2xl': { css: [removeProseMargin, proseColors, removeCodeBackticks] },
	},
	colors: {
		gray: {
			'50': '#fafafa',
			'100': '#f5f5f5',
			'200': '#e5e5e5',
			'300': '#d4d4d4',
			'400': '#a3a3a3',
			'500': '#737373',
			'600': '#525252',
			'700': '#404040',
			'800': '#262626',
			'900': '#171717',
			'950': '#0a0a0a',
		},
		border: 'hsl(var(--border))',
		input: 'hsl(var(--input))',
		ring: 'hsl(var(--ring))',
		background: 'hsl(var(--background))',
		highlight: 'hsl(var(--highlight))',
		foreground: 'hsl(var(--foreground))',
		'foreground-destructive': 'hsl(var(--foreground-destructive))',
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
		success: {
			DEFAULT: 'hsl(var(--success))',
			foreground: 'hsl(var(--success-foreground))',
		},
		warning: {
			DEFAULT: 'hsl(var(--warning))',
			foreground: 'hsl(var(--warning-foreground))',
		},
		info: {
			DEFAULT: 'hsl(var(--info))',
			foreground: 'hsl(var(--info-foreground))',
		},
	},
	borderRadius: {
		lg: `var(--radius)`,
		md: `calc(var(--radius) - 2px)`,
		sm: 'calc(var(--radius) - 4px)',
	},
	fontSize: {
		// 1rem = 16px
		/** 80px size / 84px high / bold */
		mega: ['5rem', { lineHeight: '5.25rem', fontWeight: '700' }],
		/** 56px size / 62px high / bold */
		h1: ['3.5rem', { lineHeight: '3.875rem', fontWeight: '700' }],
		/** 40px size / 48px high / bold */
		h2: ['2.5rem', { lineHeight: '3rem', fontWeight: '700' }],
		/** 32px size / 36px high / bold */
		h3: ['2rem', { lineHeight: '2.25rem', fontWeight: '700' }],
		/** 28px size / 36px high / bold */
		h4: ['1.75rem', { lineHeight: '2.25rem', fontWeight: '700' }],
		/** 24px size / 32px high / bold */
		h5: ['1.5rem', { lineHeight: '2rem', fontWeight: '700' }],
		/** 16px size / 20px high / bold */
		h6: ['1rem', { lineHeight: '1.25rem', fontWeight: '700' }],

		/** 48px size / 52px high / normal */
		'body-5xl': ['3rem', { lineHeight: '3.25rem' }],
		/** 40px size / 44px high / normal */
		'body-4xl': ['2.5rem', { lineHeight: '2.75rem' }],
		/** 36px size / 40px high / normal */
		'body-3xl': ['2.25rem', { lineHeight: '2.5rem' }],
		/** 32px size / 36px high / normal */
		'body-2xl': ['2rem', { lineHeight: '2.25rem' }],
		/** 28px size / 36px high / normal */
		'body-xl': ['1.75rem', { lineHeight: '2.25rem' }],
		/** 24px size / 32px high / normal */
		'body-lg': ['1.5rem', { lineHeight: '2rem' }],
		/** 20px size / 28px high / normal */
		'body-md': ['1.25rem', { lineHeight: '1.75rem' }],
		/** 16px size / 20px high / normal */
		'body-sm': ['1rem', { lineHeight: '1.25rem' }],
		/** 14px size / 18px high / normal */
		'body-xs': ['0.875rem', { lineHeight: '1.125rem' }],
		/** 12px size / 16px high / normal */
		'body-2xs': ['0.75rem', { lineHeight: '1rem' }],

		/** 18px size / 24px high / semibold */
		caption: ['1.125rem', { lineHeight: '1.5rem', fontWeight: '600' }],
		/** 12px size / 16px high / bold */
		button: ['0.75rem', { lineHeight: '1rem', fontWeight: '700' }],
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
} satisfies Config['theme']
