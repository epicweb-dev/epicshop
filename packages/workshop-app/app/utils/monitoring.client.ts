// Dynamic import of Sentry with error handling
const Sentry = await import('@sentry/react-router').catch((error) => {
	console.warn(
		'Failed to import @sentry/react-router:',
		error instanceof Error ? error.message : String(error),
		'- Sentry monitoring will be disabled but the application will continue to work normally',
	)
	return null
})

export function init() {
	if (!ENV.EPICSHOP_IS_PUBLISHED) return

	Sentry?.init({
		dsn: ENV.SENTRY_DSN,
		environment: ENV.MODE,
		tunnel: '/resources/lookout',
		ignoreErrors: [
			"Failed to execute 'requestPictureInPicture' on 'HTMLVideoElement'",
		],
		beforeSend(event) {
			if (
				event.exception?.values?.some((value) =>
					value.stacktrace?.frames?.some(
						(frame) =>
							frame.filename?.includes('chrome-extension:') ||
							frame.filename?.includes('moz-extension:'),
					),
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

// Helper function to capture errors with user context
export function captureExceptionWithUser(
	error: Error,
	user?: any,
	clientId?: string,
) {
	if (!Sentry) return

	const userContext = user
		? {
				id: user.id,
				email: user.email,
				username: user.name || user.email,
				ip_address: undefined, // Don't capture IP for privacy
			}
		: clientId
			? {
					id: `client-${clientId}`,
					username: 'Anonymous User',
				}
			: null

	if (userContext) {
		Sentry.setUser(userContext)
	}

	Sentry.captureException(error)
}
