import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		name: 'presence',
		environment: 'node',
		globals: true,
		coverage: {
			provider: 'v8',
			reporter: ['text', 'json', 'html'],
			exclude: ['node_modules/', 'dist/', '**/*.test.ts', '**/*.spec.ts'],
		},
		setupFiles: ['./vitest.setup.ts'],
		testTimeout: 10000,
		hookTimeout: 10000,
		teardownTimeout: 5000,
		retry: 2,
		pool: 'forks',
		isolate: true,
	},
})
