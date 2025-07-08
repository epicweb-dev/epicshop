import { nodeProfilingIntegration } from '@sentry/profiling-node'
import * as Sentry from '@sentry/react-router'

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
	beforeSendTransaction(event) {
		if (event.request?.headers?.['x-healthcheck'] === 'true') {
			return null
		}
		return event
	},
})
