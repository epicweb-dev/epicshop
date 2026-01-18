import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		name: 'utils',
		setupFiles: ['../../tests/vitest-setup.ts'],
	},
})
