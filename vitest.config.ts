import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		projects: [
			'./packages/workshop-utils',
			'./packages/workshop-presence',
			'./packages/workshop-mcp',
			'./packages/workshop-cli',
		],
		// Global test settings
		globals: true,
		environment: 'node',
		testTimeout: 15000,
		hookTimeout: 10000,
		teardownTimeout: 5000,
		// Run tests in sequence to avoid resource conflicts
		pool: 'forks',
		isolate: true,
		// Coverage settings for the entire workspace
		coverage: {
			provider: 'v8',
			reporter: ['text', 'json', 'html'],
			reportsDirectory: './coverage',
			exclude: [
				'node_modules/',
				'dist/',
				'build/',
				'**/*.test.ts',
				'**/*.spec.ts',
				'**/vitest.config.ts',
				'**/vitest.setup.ts',
				'example/',
				'tests/',
			],
			thresholds: {
				global: {
					branches: 70,
					functions: 70,
					lines: 70,
					statements: 70,
				},
			},
		},
	},
})
