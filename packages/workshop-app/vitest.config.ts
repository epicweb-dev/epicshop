import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		name: 'app',
		browser: {
			enabled: true,
			provider: playwright(),
			instances: [
				{
					browser: 'chromium',
				},
			],
		},
	},
})
