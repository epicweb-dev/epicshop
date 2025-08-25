import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		name: 'cli',
		environment: 'node',
		globals: true,
		coverage: {
			provider: 'v8',
			reporter: ['text', 'json', 'html'],
			exclude: ['node_modules/', 'dist/', '**/*.test.ts', '**/*.spec.ts'],
		},
		setupFiles: ['./vitest.setup.ts'],
		testTimeout: 15000, // Longer timeout for CLI operations
		hookTimeout: 10000,
		teardownTimeout: 5000,
		retry: 2,
		pool: 'forks',
		isolate: true,
	},
})
