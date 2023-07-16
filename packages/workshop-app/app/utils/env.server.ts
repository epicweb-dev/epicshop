const requiredServerEnvs = [
	'NODE_ENV',
	'KCDSHOP_GITHUB_ROOT',
	'KCDSHOP_CONTEXT_CWD',
] as const

declare global {
	namespace NodeJS {
		interface ProcessEnv
			extends Record<(typeof requiredServerEnvs)[number], string> {}
	}
}

for (const env of requiredServerEnvs) {
	if (!process.env[env]) {
		throw new Error(`${env} is required`)
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
	return {
		MODE: process.env.NODE_ENV,
		KCDSHOP_CONTEXT_CWD: process.env.KCDSHOP_CONTEXT_CWD,
		KCDSHOP_GITHUB_ROOT: process.env.KCDSHOP_GITHUB_ROOT,
		KCDSHOP_DEPLOYED:
			process.env.KCDSHOP_DEPLOYED === 'true' ||
			process.env.KCDSHOP_DEPLOYED === '1',
	}
}

type ENV = ReturnType<typeof getEnv>

declare global {
	var ENV: ENV
	interface Window {
		ENV: ENV
	}
}
