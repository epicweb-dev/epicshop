import * as Sentry from '@sentry/node'

export function initSentry() {
	if (typeof window !== 'undefined') return

	const isProduction = process.env.NODE_ENV === 'production'
	const isPublished = process.env.EPICSHOP_DEPLOYED === 'true' || process.env.EPICSHOP_DEPLOYED === '1'

	// Only initialize Sentry in production/published environments
	if (!isProduction && !isPublished) return

	if (!process.env.SENTRY_DSN) return

	Sentry.init({
		dsn: process.env.SENTRY_DSN,
		environment: isProduction ? 'production' : 'development',
		// Performance monitoring
		tracesSampleRate: isProduction ? 0.1 : 1.0,
		beforeSend(event, hint) {
			const error = hint.originalException
			if (error && error instanceof Error) {
				// Filter out common development errors
				if (error.message.includes('ENOENT')) {
					return null
				}
			}
			return event
		},
	})
}

export function captureException(error: unknown, context?: Record<string, unknown>) {
	if (typeof window !== 'undefined') return

	const isProduction = process.env.NODE_ENV === 'production'
	const isPublished = process.env.EPICSHOP_DEPLOYED === 'true' || process.env.EPICSHOP_DEPLOYED === '1'

	// Only capture exceptions in production/published environments
	if (!isProduction && !isPublished) return

	if (!process.env.SENTRY_DSN) return

	Sentry.captureException(error, context)
}