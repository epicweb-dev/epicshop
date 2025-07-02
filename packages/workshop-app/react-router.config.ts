import type { Config } from "@react-router/dev/config";
import { flatRoutes } from 'remix-flat-routes'

export default {
	future: {
		unstable_optimizeDeps: true,
		unstable_lazyRouteDiscovery: true,
		unstable_singleFetch: true,
	},
	ignoredRouteFiles: ['**/*'],
	serverModuleFormat: 'esm',
	routes: async (defineRoutes: any) => {
		return flatRoutes('routes', defineRoutes, {
			ignoredRouteFiles: [
				'**/.*',
				'**/*.css',
				'**/*.test.{js,jsx,ts,tsx}',
				'**/__*',
				'**/*.server.*',
				'**/*.client.*',
				'**/__*/*',
				'**/*.server/*',
				'**/*.client/*',
			],
		})
	},
} satisfies Config;