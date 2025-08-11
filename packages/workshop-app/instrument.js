import path from 'node:path'

// Dynamic import of Sentry modules with error handling
const Sentry = await import('@sentry/react-router').catch((error) => {
	console.warn(
		'Failed to import @sentry/react-router:',
		error instanceof Error ? error.message : String(error),
		'- Sentry monitoring will be disabled but the application will continue to work normally',
	)
	return null
})

const profilingModule = await import('@sentry/profiling-node').catch(
	(error) => {
		console.warn(
			'Failed to import @sentry/profiling-node:',
			error instanceof Error ? error.message : String(error),
			'- Sentry profiling will be disabled but the application will continue to work normally',
		)
		return null
	},
)

const nodeProfilingIntegration = profilingModule?.nodeProfilingIntegration

// Only initialize Sentry if we successfully imported the required modules
Sentry?.init({
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
		const isPlaygroundError = event.exception?.values?.some((value) =>
			value.stacktrace?.frames?.some((frame) =>
				frame.filename?.includes(`${path.sep}playground${path.sep}`),
			),
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
