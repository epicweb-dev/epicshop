import fs from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import { handleGitHubRepoAndRoot } from './utils.js'

const schema = z
	.object({
		EPICSHOP_CONTEXT_CWD: z.string(),
		NODE_ENV: z
			.enum(['production', 'development', 'test'] as const)
			.default('development'),
		EPICSHOP_GITHUB_REPO: z.string().default(''),
		EPICSHOP_GITHUB_ROOT: z.string().default(''),
		EPICSHOP_APP_VERSION: z.string().default('0.0.0-unknown'),
		EPICSHOP_PARENT_PORT: z.string().optional(),
		EPICSHOP_PARENT_TOKEN: z.string().optional(),
		EPICSHOP_APP_LOCATION: z.string().optional(),
		EPICSHOP_IS_PUBLISHED: z.string().optional(),
		// Sentry configuration
		SENTRY_DSN: z
			.string()
			.default(
				'https://cd51fbf4ca0834f7b3529a478a8ece4c@o913766.ingest.us.sentry.io/4509630082252800',
			),
		SENTRY_ORG: z.string().default('kent-c-dodds-tech-llc'),
		SENTRY_PROJECT: z.string().default('epicshop'),
	})
	.transform(async (env) => {
		if (env.EPICSHOP_IS_PUBLISHED === undefined) {
			env.EPICSHOP_IS_PUBLISHED = env.EPICSHOP_APP_VERSION.includes('0.0.0')
				? 'false'
				: 'true'
		}
		if (!env.EPICSHOP_GITHUB_REPO || !env.EPICSHOP_GITHUB_ROOT) {
			const pkgJsonPath = path.join(env.EPICSHOP_CONTEXT_CWD, 'package.json')
			const pkgJson = JSON.parse(await fs.readFile(pkgJsonPath, 'utf-8')) as {
				epicshop?: {
					githubRepo?: string
					githubRoot?: string
				}
			}
			const epicshopConfig = pkgJson.epicshop ?? {}
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
	}
}

type ENV = ReturnType<typeof getEnv>

declare global {
	var ENV: ENV
	interface Window {
		ENV: ENV
	}
}
