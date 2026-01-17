import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		projects: [
			'./packages/workshop-app',
			'./packages/workshop-utils',
			'./packages/workshop-presence',
			'./packages/workshop-mcp',
			'./packages/workshop-cli',
		],
	},
})
