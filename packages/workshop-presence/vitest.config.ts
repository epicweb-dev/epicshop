import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		name: 'presence',
		setupFiles: ['../../tests/vitest-setup.ts'],
	},
})
