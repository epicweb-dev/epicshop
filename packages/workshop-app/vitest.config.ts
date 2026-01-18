import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

export default defineConfig({
	optimizeDeps: {
		exclude: [
			'@epic-web/workshop-utils',
			'@epic-web/workshop-presence',
			'crypto',
			'stream',
			'execa',
			'npm-run-path',
			'unicorn-magic',
			'globby',
			'@resvg/resvg-js',
		],
	},
	test: {
		name: 'app',
		include: ['packages/workshop-app/**/*.browser.{test,spec}.?(c|m)[jt]s?(x)'],
		passWithNoTests: true,
		setupFiles: ['../../tests/vitest-setup.ts'],
		browser: {
			enabled: true,
			provider: playwright(),
			instances: [
				{
					browser: 'chromium',
				},
			],
		},
		deps: {
			optimizer: {
				client: {
					exclude: ['execa', 'npm-run-path', 'globby', 'unicorn-magic'],
				},
			},
		},
	},
})
