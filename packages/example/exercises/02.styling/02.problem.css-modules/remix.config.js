/**
 * @type {import('@remix-run/dev').AppConfig}
 */
export default {
	cacheDirectory: './node_modules/.cache/remix',
	ignoredRouteFiles: ['**/.*', '**/*.css', '**/*.test.{js,jsx,ts,tsx}'],
	serverModuleFormat: 'esm',
	serverPlatform: 'node',
	tailwind: true,
	postcss: true,
	future: {
		v2_headers: true,
		v2_errorBoundary: true,
		v2_meta: true,
		v2_routeConvention: true,
		v2_normalizeFormMethod: true,
		unstable_dev: true,
	},
}
