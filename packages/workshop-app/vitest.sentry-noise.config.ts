import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		name: 'app-sentry-noise',
		include: ['tests/catchall-route.test.ts', 'tests/sentry-filters.test.ts'],
		setupFiles: ['../../tests/vitest-setup.ts'],
		mockReset: true,
	},
})
