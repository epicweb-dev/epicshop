import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		name: 'mcp',
		setupFiles: ['../../tests/vitest-setup.ts'],
	},
})
