import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		// Enable UI for better test visualization
		ui: true,
		
		// Enable coverage collection
		coverage: {
			provider: 'v8',
			reporter: ['text', 'json', 'html'],
			exclude: [
				'node_modules/**',
				'dist/**',
				'*.config.*',
				'*.d.ts'
			]
		},
		
		// Watch mode configuration
		watch: {
			include: ['src/**/*.{ts,tsx}'],
			exclude: ['node_modules/**', 'dist/**']
		},
		
		// Test environment
		environment: 'node',
		
		// Test file patterns
		include: ['src/**/*.{test,spec}.{ts,tsx}'],
		
		// Global test setup
		globals: true,
		
		// Better error reporting
		reporter: ['verbose'],
		
		// Concurrent test execution
		pool: 'threads',
		
		// Timeout settings
		testTimeout: 10000,
		hookTimeout: 10000
	}
})