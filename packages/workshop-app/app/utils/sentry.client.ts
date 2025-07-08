import * as Sentry from '@sentry/react'
import { useEffect } from 'react'
import {
	useLocation,
	useMatches,
	useNavigationType,
	createRoutesFromChildren,
	matchRoutes,
} from 'react-router'

export function initSentry() {
	if (typeof window === 'undefined') return

	const ENV = window.ENV
	if (!ENV.SENTRY_DSN) return

	const isProduction = ENV.MODE === 'production'
	const isPublished = ENV.EPICSHOP_DEPLOYED

	// Only initialize Sentry in production/published environments
	if (!isProduction && !isPublished) return

	Sentry.init({
		dsn: ENV.SENTRY_DSN,
		environment: isProduction ? 'production' : 'development',
		integrations: [
			// React Router v7 integration
			Sentry.reactRouterV7BrowserTracingIntegration({
				useEffect,
				useLocation,
				useNavigationType,
				createRoutesFromChildren,
				matchRoutes,
			}),
			// Session replay for debugging
			Sentry.replayIntegration({
				maskAllText: false,
				blockAllMedia: false,
			}),
		],
		// Performance monitoring
		tracesSampleRate: isProduction ? 0.1 : 1.0,
		// Session replay
		replaysSessionSampleRate: isProduction ? 0.1 : 1.0,
		replaysOnErrorSampleRate: 1.0,
		// Capture console errors
		beforeSend(event, hint) {
			const error = hint.originalException
			if (error && error instanceof Error) {
				// Filter out development-only errors
				if (error.message.includes('ResizeObserver loop limit exceeded')) {
					return null
				}
			}
			return event
		},
	})
}

export function captureException(error: unknown, context?: Record<string, unknown>) {
	if (typeof window === 'undefined') return

	const ENV = window.ENV
	if (!ENV.SENTRY_DSN) return

	const isProduction = ENV.MODE === 'production'
	const isPublished = ENV.EPICSHOP_DEPLOYED

	// Only capture exceptions in production/published environments
	if (!isProduction && !isPublished) return

	Sentry.captureException(error, context)
}