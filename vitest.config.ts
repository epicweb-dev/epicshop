import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		projects: [
			'./packages/workshop-utils',
			'./packages/workshop-presence',
			'./packages/workshop-mcp',
		],
	},
})
