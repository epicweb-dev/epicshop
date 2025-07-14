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
	integrations: [
		Sentry.httpIntegration(),
		nodeProfilingIntegration(),
		{
			name: 'CorrelationIdIntegration',
			setupOnce() {
				// This will be used to add correlation IDs to all events
			},
		},
	],
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
	beforeSend(event) {
		// Add correlation ID to server-side events
		const correlationId = Sentry.getActiveSpan()?.getAttribute('correlationId')
		if (correlationId) {
			event.extra = {
				...event.extra,
				correlationId,
			}
			event.tags = {
				...event.tags,
				correlationId,
			}
		}
		return event
	},
})
