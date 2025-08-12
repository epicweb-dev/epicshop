import { PassThrough } from 'stream'
import { getAuthInfo, getClientId } from '@epic-web/workshop-utils/db.server'
import { createReadableStreamFromReadable } from '@react-router/node'
// Dynamic import of Sentry with error handling
const Sentry = await import('@sentry/react-router').catch((error) => {
	console.warn(
		'Failed to import @sentry/react-router:',
		error instanceof Error ? error.message : String(error),
		'- Sentry monitoring will be disabled but the application will continue to work normally',
	)
	return null
})

import { isbot } from 'isbot'
import { renderToPipeableStream } from 'react-dom/server'
import {
	type EntryContext,
	ServerRouter,
	type LoaderFunctionArgs,
	type ActionFunctionArgs,
} from 'react-router'

export const streamTimeout = 60000
const ABORT_DELAY = streamTimeout + 1000

export async function handleError(
	error: unknown,
	{ request }: LoaderFunctionArgs | ActionFunctionArgs,
): Promise<void> {
	if (request.signal.aborted) return
	if (ENV.EPICSHOP_IS_PUBLISHED) {
		try {
			// Get user information for Sentry context
			const authInfo = await getAuthInfo()
			const clientId = await getClientId()

			if (Sentry) {
				if (authInfo) {
					Sentry.setUser({
						id: authInfo.id,
						email: authInfo.email,
						username: authInfo.name || authInfo.email,
						ip_address: undefined, // Don't capture IP for privacy
					})
				} else if (clientId) {
					Sentry.setUser({
						id: `client-${clientId}`,
						username: 'Anonymous User',
					})
				}

				Sentry.captureException(error)
			}
		} catch (sentryError) {
			console.error('Failed to capture error in Sentry:', sentryError)
			// Fallback to basic error capture
			Sentry?.captureException(error)
		}
	}
}

export default function handleRequest(
	request: Request,
	responseStatusCode: number,
	responseHeaders: Headers,
	reactRouterContext: EntryContext,
) {
	const callbackName = isbot(request.headers.get('user-agent'))
		? 'onAllReady'
		: 'onShellReady'

	return new Promise((resolve, reject) => {
		let didError = false

		const { pipe, abort } = renderToPipeableStream(
			<ServerRouter context={reactRouterContext} url={request.url} />,
			{
				[callbackName]() {
					const body = new PassThrough()

					responseHeaders.set('Content-Type', 'text/html')

					if (ENV.EPICSHOP_IS_PUBLISHED && process.env.SENTRY_DSN) {
						responseHeaders.append('Document-Policy', 'js-profiling')
					}

					resolve(
						new Response(createReadableStreamFromReadable(body), {
							status: didError ? 500 : responseStatusCode,
							headers: responseHeaders,
						}),
					)
					pipe(body)
				},
				onShellError(err: unknown) {
					reject(err)
				},
				onError(error: unknown) {
					didError = true
					console.error(error)
				},
			},
		)
		setTimeout(abort, ABORT_DELAY)
	})
}
