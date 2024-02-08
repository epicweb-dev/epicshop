import { unstable_vitePlugin as remix } from '@remix-run/dev'
import { flatRoutes } from 'remix-flat-routes'
import { defineConfig } from 'vite'

const MODE = process.env.NODE_ENV

export default defineConfig({
	optimizeDeps: {
		exclude: ['fsevents', 'globby'],
	},
	build: {
		cssMinify: MODE === 'production',
		rollupOptions: {
			external: [/node:.*/, 'stream', 'crypto', 'fsevents', 'globby'],
		},
	},
	plugins: [
		remix({
			ignoredRouteFiles: ['**/*'],
			serverModuleFormat: 'esm',
			routes: async defineRoutes => {
				return flatRoutes('routes', defineRoutes, {
					ignoredRouteFiles: [
						'**/.*',
						'**/*.css',
						'**/*.test.{js,jsx,ts,tsx}',
						'**/__*',
					],
				})
			},
		}),
	],
})
