import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { handleGitHubRepoAndRoot } from './utils.js'

const __dirname = path.dirname(new URL(import.meta.url).pathname)

const schema = z
	.object({
		EPICSHOP_CONTEXT_CWD: z.string().default(process.cwd()),
		NODE_ENV: z
			.enum(['production', 'development', 'test'] as const)
			.default('development'),
		EPICSHOP_GITHUB_REPO: z.string().default(''),
		EPICSHOP_GITHUB_ROOT: z.string().default(''),
		EPICSHOP_APP_VERSION: z.string().default('0.0.0-unknown'),
		EPICSHOP_PARENT_PORT: z.string().optional(),
		EPICSHOP_PARENT_TOKEN: z.string().optional(),
		EPICSHOP_APP_LOCATION: z.string().optional(),
		EPICSHOP_IS_PUBLISHED: z
			.string()
			.default(__dirname.includes('node_modules') ? 'true' : 'false'),
		// Sentry configuration
		SENTRY_DSN: z
			.string()
			.default(
				'https://cd51fbf4ca0834f7b3529a478a8ece4c@o913766.ingest.us.sentry.io/4509630082252800',
			),
		SENTRY_ORG: z.string().default('kent-c-dodds-tech-llc'),
		SENTRY_PROJECT: z.string().default('epicshop'),
		SENTRY_PROJECT_ID: z.string().default('4509630082252800'),
	})
	.transform(async (env) => {
		const pkgJsonPath = path.join(env.EPICSHOP_CONTEXT_CWD, 'package.json')
		const pkgJson = JSON.parse(await fs.readFile(pkgJsonPath, 'utf-8')) as {
			epicshop?: {
				githubRepo?: string
				githubRoot?: string
			}
		}
		const epicshopConfig = pkgJson.epicshop ?? {}
		if (!epicshopConfig) {
			throw new Error(
				`No epicshop configuration found in "${pkgJsonPath}". If this is a workshop directory, please add an "epicshop" section to your package.json. If this is not a workshop directory, please set the EPICSHOP_CONTEXT_CWD environment variable to the directory containing your package.json with the "epicshop" config section.`,
			)
		}
		if (env.EPICSHOP_APP_LOCATION === undefined) {
			const workshopAppPath = import.meta.resolve(
				'@epic-web/workshop-app/package.json',
			)
			const packagePath = fileURLToPath(workshopAppPath)
			env.EPICSHOP_APP_LOCATION = path.dirname(packagePath)
		}
		if (env.EPICSHOP_APP_VERSION === '0.0.0-unknown') {
			const packageJson = JSON.parse(
				await fs.readFile(
					path.join(env.EPICSHOP_APP_LOCATION, 'package.json'),
					'utf-8',
				),
			) as { version: string }
			env.EPICSHOP_APP_VERSION = packageJson.version
		}
		if (!env.EPICSHOP_GITHUB_REPO || !env.EPICSHOP_GITHUB_ROOT) {
			const { githubRepo, githubRoot } = handleGitHubRepoAndRoot({
				githubRepo: epicshopConfig.githubRepo,
				githubRoot: epicshopConfig.githubRoot,
			})
			env.EPICSHOP_GITHUB_REPO = githubRepo
			env.EPICSHOP_GITHUB_ROOT = githubRoot
		}
		return env
	})

declare global {
	namespace NodeJS {
		interface ProcessEnv extends z.infer<typeof schema> {}
	}
}

export async function init() {
	const parsed = await schema.safeParseAsync(process.env)

	if (!parsed.success) {
		console.error(
			'❌ Invalid environment variables:',
			parsed.error.flatten().fieldErrors,
		)

		throw new Error('Invalid environment variables')
	}

	Object.assign(process.env, parsed.data)
}

/**
 * This is used in both `entry.server.ts` and `root.tsx` to ensure that
 * the environment variables are set and globally available before the app is
 * started.
 *
 * NOTE: Do *not* add any environment variables in here that you do not wish to
 * be included in the client.
 * @returns all public ENV variables
 */
export function getEnv() {
	return {
		MODE: process.env.NODE_ENV,
		EPICSHOP_CONTEXT_CWD: process.env.EPICSHOP_CONTEXT_CWD,
		EPICSHOP_GITHUB_REPO: process.env.EPICSHOP_GITHUB_REPO,
		EPICSHOP_GITHUB_ROOT: process.env.EPICSHOP_GITHUB_ROOT,
		EPICSHOP_DEPLOYED:
			process.env.EPICSHOP_DEPLOYED === 'true' ||
			process.env.EPICSHOP_DEPLOYED === '1',
		EPICSHOP_APP_VERSION: process.env.EPICSHOP_APP_VERSION,
		EPICSHOP_PARENT_PORT: process.env.EPICSHOP_PARENT_PORT,
		EPICSHOP_PARENT_TOKEN: process.env.EPICSHOP_PARENT_TOKEN,
		EPICSHOP_IS_PUBLISHED: process.env.EPICSHOP_IS_PUBLISHED === 'true',
		SENTRY_DSN: process.env.SENTRY_DSN,
		SENTRY_PROJECT_ID: process.env.SENTRY_PROJECT_ID,
	}
}

type ENV = ReturnType<typeof getEnv>

declare global {
	var ENV: ENV
	interface Window {
		ENV: ENV
	}
}
