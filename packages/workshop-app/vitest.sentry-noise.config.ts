import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		name: 'app-sentry-noise',
		include: ['tests/*.{test,spec}.{ts,tsx}'],
		exclude: ['tests/*.browser.{test,spec}.{ts,tsx}'],
		setupFiles: ['../../tests/vitest-setup.ts'],
		mockReset: true,
	},
	resolve: {
		extensions: ['.js', '.ts', '.tsx'],
	},
})
