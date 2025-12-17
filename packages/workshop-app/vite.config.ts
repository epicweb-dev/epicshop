import { readFile } from 'node:fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { reactRouter } from '@react-router/dev/vite'
import {
	sentryReactRouter,
	type SentryReactRouterBuildOptions,
} from '@sentry/react-router'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { envOnlyMacros } from 'vite-env-only'
import devtoolsJson from 'vite-plugin-devtools-json'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const here = (...p: Array<string>) => path.join(__dirname, ...p)

async function makeSourceAliases(moduleName: string, folderName: string) {
	const filePath = here('..', folderName, 'package.json')
	const pkg = JSON.parse(await readFile(filePath, 'utf-8')) as {
		zshy: { exports: Record<string, string> }
	}

	return Object.entries(pkg.zshy.exports).reduce<Record<string, string>>(
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
	...(await makeSourceAliases('@epic-web/workshop-utils', 'workshop-utils')),
	...(await makeSourceAliases(
		'@epic-web/workshop-presence',
		'workshop-presence',
	)),
}

const MODE = process.env.NODE_ENV

const sentryConfig: SentryReactRouterBuildOptions = {
	authToken: process.env.SENTRY_AUTH_TOKEN,
	org: process.env.SENTRY_ORG,
	project: process.env.SENTRY_PROJECT,
	unstable_sentryVitePluginOptions: {
		release: {
			name: process.env.EPICSHOP_APP_COMMIT_SHA,
			setCommits: {
				auto: true,
			},
		},
		sourcemaps: {
			filesToDeleteAfterUpload: ['./build/**/*.map', '.server-build/**/*.map'],
		},
	},
}

export default defineConfig((config) => ({
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
	sentryConfig,
	plugins: [
		envOnlyMacros(),
		tailwindcss(),
		reactRouter(),
		MODE === 'production' && process.env.SENTRY_AUTH_TOKEN
			? sentryReactRouter(sentryConfig, config)
			: null,
		devtoolsJson(),
	].filter(Boolean),
}))
