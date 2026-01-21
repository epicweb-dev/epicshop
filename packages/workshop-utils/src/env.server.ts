import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import md5 from 'md5-hex'
import { z } from 'zod'
import { handleGitHubRepoAndRoot } from './utils.ts'

const __dirname = path.dirname(new URL(import.meta.url).pathname)

const schema = z
	.object({
		EPICSHOP_CONTEXT_CWD: z.string().default(''),
		EPICSHOP_WORKSHOP_INSTANCE_ID: z.string().default(''),
		NODE_ENV: z
			.enum(['production', 'development', 'test'] as const)
			.default('development'),
		EPICSHOP_GITHUB_REPO: z.string().default(''),
		EPICSHOP_GITHUB_ROOT: z.string().default(''),
		EPICSHOP_APP_VERSION: z.string().optional(),
		EPICSHOP_APP_COMMIT_SHA: z.string().optional(),
		EPICSHOP_PARENT_PORT: z.string().optional(),
		EPICSHOP_PARENT_TOKEN: z.string().optional(),
		EPICSHOP_APP_LOCATION: z.string().optional(),
		EPICSHOP_HOME_DIR: z.string().default(path.join(os.homedir(), '.epicshop')),
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
		SENTRY_RELEASE: z.string().optional(),
	})
	.transform(async (env) => {
		if (env.EPICSHOP_CONTEXT_CWD === '') {
			const contextCwd = await getEpicshopContextCwd()
			if (contextCwd) {
				env.EPICSHOP_CONTEXT_CWD = contextCwd
			}
		}
		if (env.EPICSHOP_WORKSHOP_INSTANCE_ID === '') {
			env.EPICSHOP_WORKSHOP_INSTANCE_ID = md5(env.EPICSHOP_CONTEXT_CWD)
		}
		if (env.EPICSHOP_CONTEXT_CWD) {
			const pkgJsonPath = path.join(env.EPICSHOP_CONTEXT_CWD, 'package.json')
			const pkgJson = JSON.parse(await fs.readFile(pkgJsonPath, 'utf-8')) as {
				epicshop: {
					githubRepo?: string
					githubRoot?: string
				}
			}
			const epicshopConfig = pkgJson.epicshop

			if (!env.EPICSHOP_GITHUB_REPO || !env.EPICSHOP_GITHUB_ROOT) {
				const { githubRepo, githubRoot } = handleGitHubRepoAndRoot({
					githubRepo: epicshopConfig.githubRepo,
					githubRoot: epicshopConfig.githubRoot,
				})
				env.EPICSHOP_GITHUB_REPO = githubRepo
				env.EPICSHOP_GITHUB_ROOT = githubRoot
			}
		}
		if (env.EPICSHOP_APP_LOCATION === undefined) {
			try {
				const workshopAppPath = import.meta
					.resolve('@epic-web/workshop-app/package.json')
				const packagePath = fileURLToPath(workshopAppPath)
				env.EPICSHOP_APP_LOCATION = path.dirname(packagePath)
			} catch {
				// we may be running outside the context of a workshop app
			}
		}
		if (!env.EPICSHOP_APP_VERSION) {
			if (env.EPICSHOP_APP_LOCATION) {
				const packageJson = JSON.parse(
					await fs.readFile(
						path.join(env.EPICSHOP_APP_LOCATION, 'package.json'),
						'utf-8',
					),
				) as { version: string }
				env.EPICSHOP_APP_VERSION = packageJson.version
			}
		}
		return env
	})

async function getEpicshopContextCwd() {
	if (process.env.EPICSHOP_CONTEXT_CWD) {
		return process.env.EPICSHOP_CONTEXT_CWD
	}
	let dir = process.cwd()
	while (true) {
		const pkgPath = path.join(dir, 'package.json')
		try {
			const pkgRaw = await fs.readFile(pkgPath, 'utf8')
			const pkg = JSON.parse(pkgRaw) as { epicshop?: boolean }
			if (pkg.epicshop) {
				return dir
			}
		} catch {}
		const parentDir = path.dirname(dir)
		if (parentDir === dir) break
		dir = parentDir
	}
	return null
}

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
		EPICSHOP_WORKSHOP_INSTANCE_ID: process.env.EPICSHOP_WORKSHOP_INSTANCE_ID,
		EPICSHOP_GITHUB_REPO: process.env.EPICSHOP_GITHUB_REPO,
		EPICSHOP_GITHUB_ROOT: process.env.EPICSHOP_GITHUB_ROOT,
		EPICSHOP_DEPLOYED:
			process.env.EPICSHOP_DEPLOYED === 'true' ||
			process.env.EPICSHOP_DEPLOYED === '1',
		EPICSHOP_APP_VERSION: process.env.EPICSHOP_APP_VERSION,
		EPICSHOP_APP_COMMIT_SHA: process.env.EPICSHOP_APP_COMMIT_SHA,
		EPICSHOP_PARENT_PORT: process.env.EPICSHOP_PARENT_PORT,
		EPICSHOP_PARENT_TOKEN: process.env.EPICSHOP_PARENT_TOKEN,
		EPICSHOP_IS_PUBLISHED: process.env.EPICSHOP_IS_PUBLISHED === 'true',
		SENTRY_DSN: process.env.SENTRY_DSN,
		SENTRY_PROJECT_ID: process.env.SENTRY_PROJECT_ID,
		SENTRY_RELEASE: process.env.SENTRY_RELEASE,
	}
}

type ENV = ReturnType<typeof getEnv>

declare global {
	var ENV: ENV
	interface Window {
		ENV: ENV
	}
}
