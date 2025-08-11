// Dynamic import of Sentry with error handling
let Sentry: any = null

try {
	Sentry = await import('@sentry/react-router')
} catch (error) {
	console.warn('Failed to import @sentry/react-router:', error.message)
}

export function init() {
	if (!ENV.EPICSHOP_IS_PUBLISHED) return
	
	// Only initialize if Sentry was successfully imported
	if (!Sentry) {
		console.warn('Sentry initialization skipped due to import failure')
		return
	}
	
	Sentry.init({
		dsn: ENV.SENTRY_DSN,
		environment: ENV.MODE,
		tunnel: '/resources/lookout',
		ignoreErrors: [
			"Failed to execute 'requestPictureInPicture' on 'HTMLVideoElement'"
		],
		beforeSend(event) {
			if (
				event.exception?.values?.some(value =>
					value.stacktrace?.frames?.some(
						frame =>
							frame.filename?.includes('chrome-extension:') ||
							frame.filename?.includes('moz-extension:')
					)
				)
			) {
				return null
			}
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
