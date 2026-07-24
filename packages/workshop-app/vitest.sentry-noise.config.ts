import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		name: 'app-sentry-noise',
		include: ['tests/*.test.ts'],
		setupFiles: ['../../tests/vitest-setup.ts'],
		mockReset: true,
	},
	resolve: {
		extensions: ['.js', '.ts', '.tsx'],
	},
})
