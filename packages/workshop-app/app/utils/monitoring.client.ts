import * as Sentry from '@sentry/react-router'
import { generateCorrelationId, setCorrelationId, getCorrelationId, CORRELATION_ID_HEADER } from './request-correlation'

export function init() {
	if (!ENV.EPICSHOP_IS_PUBLISHED) return
	Sentry.init({
		dsn: ENV.SENTRY_DSN,
		environment: ENV.MODE,
		tunnel: '/resources/lookout',
		beforeSend(event) {
			if (event.request?.url) {
				const url = new URL(event.request.url)
				if (
					url.protocol === 'chrome-extension:' ||
					url.protocol === 'moz-extension:'
				) {
					return null
				}
			}
			
			// Add correlation ID to event context
			const correlationId = getCorrelationId()
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
		integrations: [
			Sentry.replayIntegration(),
			Sentry.browserProfilingIntegration(),
		],
		tracesSampleRate: 1.0,
		replaysSessionSampleRate: 0.1,
		replaysOnErrorSampleRate: 1.0,
	})
}

// Set up request correlation for React Router requests
export function setupRequestCorrelation() {
	if (!ENV.EPICSHOP_IS_PUBLISHED) return
	
	// Intercept React Router requests by patching fetch
	const originalFetch = window.fetch
	window.fetch = function(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
		const correlationId = generateCorrelationId()
		setCorrelationId(correlationId)
		
		const headers = new Headers(init?.headers)
		headers.set(CORRELATION_ID_HEADER, correlationId)
		
		const newInit = {
			...init,
			headers,
		}
		
		return originalFetch(input, newInit)
	}
}
