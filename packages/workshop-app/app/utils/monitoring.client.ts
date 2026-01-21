import { useEffect } from 'react'
import {
	createRoutesFromChildren,
	matchRoutes,
	useLocation,
	useNavigationType,
} from 'react-router'

// Dynamic import of Sentry with error handling
const Sentry = await import('@sentry/react-router').catch((error) => {
	console.warn(
		'Failed to import @sentry/react-router:',
		error instanceof Error ? error.message : String(error),
		'- Sentry monitoring will be disabled but the application will continue to work normally',
	)
	return null
})

type TracePropagationTarget = string | RegExp
type SentryModule = NonNullable<typeof Sentry>
type SentryIntegration = ReturnType<SentryModule['replayIntegration']>

function getTracePropagationTargets(): Array<TracePropagationTarget> {
	if (typeof window === 'undefined') return []
	return [window.location.origin, /^\//]
}

function getTracingIntegration(
	tracePropagationTargets: Array<TracePropagationTarget>,
): SentryIntegration | null {
	if (!Sentry) return null

	const sentryModule = Sentry as unknown as {
		reactRouterTracingIntegration?: (options: {
			useEffect: typeof useEffect
			useLocation: typeof useLocation
			useNavigationType: typeof useNavigationType
			createRoutesFromChildren: typeof createRoutesFromChildren
			matchRoutes: typeof matchRoutes
			tracePropagationTargets?: Array<TracePropagationTarget>
		}) => SentryIntegration
		reactRouterV7BrowserTracingIntegration?: (options: {
			useEffect: typeof useEffect
			useLocation: typeof useLocation
			useNavigationType: typeof useNavigationType
			createRoutesFromChildren: typeof createRoutesFromChildren
			matchRoutes: typeof matchRoutes
			tracePropagationTargets?: Array<TracePropagationTarget>
		}) => SentryIntegration
		browserTracingIntegration?: (options?: {
			tracePropagationTargets?: Array<TracePropagationTarget>
		}) => SentryIntegration
	}

	const routerOptions = {
		useEffect,
		useLocation,
		useNavigationType,
		createRoutesFromChildren,
		matchRoutes,
		tracePropagationTargets,
	}

	if (sentryModule.reactRouterTracingIntegration) {
		return sentryModule.reactRouterTracingIntegration(routerOptions)
	}

	if (sentryModule.reactRouterV7BrowserTracingIntegration) {
		return sentryModule.reactRouterV7BrowserTracingIntegration(routerOptions)
	}

	return (
		sentryModule.browserTracingIntegration?.({ tracePropagationTargets }) ??
		null
	)
}

export function init() {
	if (!ENV.EPICSHOP_IS_PUBLISHED) return
	if (!Sentry) return

	const tracePropagationTargets = getTracePropagationTargets()
	const tracingIntegration = getTracingIntegration(tracePropagationTargets)
	const integrations = [
		Sentry.replayIntegration(),
		Sentry.browserProfilingIntegration(),
	]

	if (tracingIntegration) integrations.unshift(tracingIntegration)

	const release =
		ENV.SENTRY_RELEASE ??
		ENV.EPICSHOP_APP_COMMIT_SHA ??
		ENV.EPICSHOP_APP_VERSION

	Sentry.init({
		dsn: ENV.SENTRY_DSN,
		sendDefaultPii: true,
		environment: ENV.MODE,
		release,
		tunnel: '/resources/lookout',
		tracePropagationTargets,
		ignoreErrors: [
			"Failed to execute 'requestPictureInPicture' on 'HTMLVideoElement'",
		],
		beforeSend(event) {
			// Don't send errors to Sentry for bot requests
			if (typeof navigator !== 'undefined' && navigator.userAgent) {
				// Basic bot detection for client-side - check for common bot indicators
				const userAgent = navigator.userAgent.toLowerCase()
				const botKeywords = [
					'bot',
					'crawl',
					'spider',
					'scrape',
					'fetch',
					'monitor',
					'test',
					'headless',
					'phantom',
					'puppeteer',
					'selenium',
					'webdriver',
					'lighthouse',
					'pagespeed',
					'facebookexternalhit',
					'twitterbot',
					'googlebot',
					'bingbot',
					'slackbot',
					'whatsapp',
					'linkedinbot',
				]
				if (botKeywords.some((keyword) => userAgent.includes(keyword))) {
					return null
				}
			}

			// Very common when learners shut down the local server and the browser keeps trying to fetch
			const failedToFetch =
				event.exception?.values?.some(
					(v) =>
						typeof v.value === 'string' && /Failed to fetch/i.test(v.value),
				) ?? false

			if (failedToFetch && !ENV.EPICSHOP_DEPLOYED) return null

			// Filter out browser extension related errors
			const extensionError = event.exception?.values?.some((value) =>
				value.stacktrace?.frames?.some(
					(frame) =>
						frame.filename?.includes('chrome-extension:') ||
						frame.filename?.includes('moz-extension:'),
				),
			)
			if (extensionError) return null

			// Filter out errors containing browser extension globals
			const extensionGlobalKeywords = ['__firefox__', 'ethereum']
			const extensionGlobalError = event.exception?.values?.some(
				(value) =>
					typeof value.value === 'string' &&
					extensionGlobalKeywords.some((keyword) =>
						value.value?.includes(keyword),
					),
			)
			if (extensionGlobalError) return null
			if (event.request?.url) {
				const url = new URL(event.request.url)
				if (
					url.protocol === 'chrome-extension:' ||
					url.protocol === 'moz-extension:'
				) {
					return null
				}
			}
			return event
		},
		integrations,
		tracesSampleRate: 1.0,
		replaysSessionSampleRate: 0.1,
		replaysOnErrorSampleRate: 1.0,
		initialScope: {
			tags: {
				github_repo: ENV.EPICSHOP_GITHUB_REPO || 'unknown',
				deployed: ENV.EPICSHOP_DEPLOYED ? 'true' : 'false',
				app_version: ENV.EPICSHOP_APP_VERSION || 'unknown',
				environment: ENV.MODE || 'development',
			},
		},
	})
}
