import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { vitePlugin as remix } from '@remix-run/dev'
import { flatRoutes } from 'remix-flat-routes'
import { defineConfig } from 'vite'
import { envOnlyMacros } from 'vite-env-only'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const here = (...p: Array<string>) => path.join(__dirname, ...p)

async function makeTshyAliases(moduleName: string, folderName: string) {
	const filePath = pathToFileURL(here('..', folderName, 'package.json')).href
	const { default: pkg } = await import(filePath, { with: { type: 'json' } })

	return Object.entries(pkg.tshy.exports).reduce<Record<string, string>>(
		(acc, [key, value]) => {
			if (typeof value !== 'string') return acc
			const importString = path.join(moduleName, key).replace(/\\/g, '/')
			acc[importString] = here('..', folderName, value).replace(/\\/g, '/')
			return acc
		},
		{},
	)
}

const aliases = {
	...(await makeTshyAliases('@epic-web/workshop-utils', 'workshop-utils')),
	...(await makeTshyAliases(
		'@epic-web/workshop-presence',
		'workshop-presence',
	)),
}

const MODE = process.env.NODE_ENV

declare module '@remix-run/server-runtime' {
	// or cloudflare, deno, etc.
	interface Future {
		unstable_singleFetch: true
	}
}

export default defineConfig({
	optimizeDeps: {
		exclude: [
			'fsevents',
			'globby',
			'@epic-web/workshop-utils',
			'@epic-web/workshop-presence',
			'crypto',
			'stream',
			'execa',
			'npm-run-path',
			'unicorn-magic',
			'@resvg/resvg-js',
		],
	},
	build: {
		cssMinify: MODE === 'production',
		rollupOptions: {
			external: [
				/node:.*/,
				'stream',
				'crypto',
				'fsevents',
				'globby',
				'execa',
				'npm-run-path',
				'unicorn-magic',
				/^@epic-web\/workshop-utils.*/,
				'@resvg/resvg-js',
			],
		},
	},
	resolve: { alias: aliases },
	plugins: [
		envOnlyMacros(),
		remix({
			future: {
				v3_fetcherPersist: true,
				v3_relativeSplatPath: true,
				v3_throwAbortReason: true,
				unstable_optimizeDeps: true,
				unstable_lazyRouteDiscovery: true,
				unstable_singleFetch: true,
			},
			ignoredRouteFiles: ['**/*'],
			serverModuleFormat: 'esm',
			routes: async (defineRoutes) => {
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
		}),
	],
})
