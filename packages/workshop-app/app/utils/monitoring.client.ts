import * as Sentry from '@sentry/react-router'

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
			return event
		},
		integrations: [
			Sentry.replayIntegration(),
			Sentry.browserProfilingIntegration(),
		],
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
