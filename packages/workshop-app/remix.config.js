import { flatRoutes } from 'remix-flat-routes'

/**
 * @type {import('@remix-run/dev').AppConfig}
 */
export default {
	cacheDirectory: './node_modules/.cache/remix',
	ignoredRouteFiles: ['**/*'],
	serverModuleFormat: 'esm',
	serverPlatform: 'node',
	tailwind: true,
	postcss: true,
	watchPaths: ['./tailwind.config.ts', './utils/*.*'],
	browserNodeBuiltinsPolyfill: { modules: { path: true } },
	future: {
		headers: true,
		errorBoundary: true,
		meta: true,
		routeConvention: true,
		normalizeFormMethod: true,
		dev: true,
	},
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
}
