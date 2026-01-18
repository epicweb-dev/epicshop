import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		name: 'cli',
		setupFiles: ['../../tests/vitest-setup.ts'],
	},
})
