import { type RouteConfig } from '@react-router/dev/routes'
import { flatRoutes } from '@react-router/fs-routes'

export default flatRoutes({
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
}) satisfies RouteConfig
