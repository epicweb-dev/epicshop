import path from 'node:path'

// Dynamic import of Sentry modules with error handling
let Sentry = null
let nodeProfilingIntegration = null

// Try to import Sentry modules dynamically
const [sentryModule, profilingModule] = await Promise.allSettled([
	import('@sentry/react-router'),
	import('@sentry/profiling-node')
])

if (sentryModule.status === 'fulfilled') {
	Sentry = sentryModule.value
} else {
	console.warn('Failed to import @sentry/react-router:', sentryModule.reason?.message)
}

if (profilingModule.status === 'fulfilled') {
	nodeProfilingIntegration = profilingModule.value.nodeProfilingIntegration
} else {
	console.warn('Failed to import @sentry/profiling-node:', profilingModule.reason?.message)
}

// Only initialize Sentry if we successfully imported the required modules
if (Sentry && nodeProfilingIntegration) {
	Sentry.init({
		dsn: process.env.SENTRY_DSN,
		environment: process.env.NODE_ENV ?? 'development',
		denyUrls: [
			/\/resources\/healthcheck/,
			/\/build\//,
			/\/favicons\//,
			/\/img\//,
			/\/fonts\//,
			/\/favicon.ico/,
			/\/site\.webmanifest/,
		],
		integrations: [Sentry.httpIntegration(), nodeProfilingIntegration()],
		tracesSampler(samplingContext) {
			if (samplingContext.request?.url?.includes('/resources/healthcheck')) {
				return 0
			}
			return process.env.NODE_ENV === 'production' ? 1 : 0
		},
		beforeSend(event) {
			const isPlaygroundError = event.exception?.values?.some(value =>
				value.stacktrace?.frames?.some(frame => frame.filename?.includes(`${path.sep}playground${path.sep}`))
			)
			if (isPlaygroundError) {
				return null
			}
			return event
		},
		beforeSendTransaction(event) {
			if (event.request?.headers?.['x-healthcheck'] === 'true') {
				return null
			}
			return event
		},
		initialScope: {
			tags: {
				github_repo: process.env.EPICSHOP_GITHUB_REPO || 'unknown',
				deployed:
					process.env.EPICSHOP_DEPLOYED === 'true' ||
					process.env.EPICSHOP_DEPLOYED === '1'
						? 'true'
						: 'false',
				app_version: process.env.EPICSHOP_APP_VERSION || 'unknown',
				environment: process.env.NODE_ENV || 'development',
			},
		},
	})
} else {
	console.warn('Sentry initialization skipped due to import failures')
}
