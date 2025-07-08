import { z } from 'zod'

const schema = z.object({
	NODE_ENV: z
		.enum(['production', 'development', 'test'] as const)
		.default('development'),
	EPICSHOP_GITHUB_REPO: z.string(),
	EPICSHOP_GITHUB_ROOT: z.string(),
	EPICSHOP_CONTEXT_CWD: z.string(),
	EPICSHOP_APP_VERSION: z.string().optional(),
	EPICSHOP_PARENT_PORT: z.string().optional(),
	EPICSHOP_PARENT_TOKEN: z.string().optional(),
	SENTRY_DSN: z.string().optional(),
})

declare global {
	namespace NodeJS {
		interface ProcessEnv extends z.infer<typeof schema> {}
	}
}

export function init() {
	const parsed = schema.safeParse(process.env)

	if (!parsed.success) {
		console.error(
			'❌ Invalid environment variables:',
			parsed.error.flatten().fieldErrors,
		)

		throw new Error('Invalid environment variables')
	}
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
	const isProduction = process.env.NODE_ENV === 'production'
	const isPublished = !process.env.EPICSHOP_CONTEXT_CWD || process.env.EPICSHOP_DEPLOYED === 'true' || process.env.EPICSHOP_DEPLOYED === '1'
	
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
		// Only include Sentry DSN in production/published environments
		SENTRY_DSN: (isProduction || isPublished) ? process.env.SENTRY_DSN : undefined,
	}
}

type ENV = ReturnType<typeof getEnv>

declare global {
	var ENV: ENV
	interface Window {
		ENV: ENV
	}
}
