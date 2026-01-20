import { PassThrough } from 'stream'
import { getUserInfo } from '@epic-web/workshop-utils/epic-api.server'
import { getUserId } from '@epic-web/workshop-utils/user.server'
import { createReadableStreamFromReadable } from '@react-router/node'
// Dynamic import of Sentry with error handling
const sentryPromise = import('@sentry/react-router').catch((error) => {
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
import { getSentryUser } from './utils/sentry-user'

export const streamTimeout = 60000
const ABORT_DELAY = streamTimeout + 1000

export async function handleError(
	error: unknown,
	{ request }: LoaderFunctionArgs | ActionFunctionArgs,
): Promise<void> {
	if (request.signal.aborted) return
	// Don't send errors to Sentry for bot requests
	if (isbot(request.headers.get('user-agent'))) return
	if (ENV.EPICSHOP_IS_PUBLISHED) {
		const Sentry = await sentryPromise
		if (Sentry) {
			const [userIdResult, userResult] = await Promise.allSettled([
				getUserId({ request }),
				getUserInfo({ request }),
			])
			const userId =
				userIdResult.status === 'fulfilled' ? userIdResult.value : null
			const user = userResult.status === 'fulfilled' ? userResult.value : null
			const sentryUser = getSentryUser({ user, userId })
			Sentry.withScope((scope) => {
				if (sentryUser) {
					scope.setUser(sentryUser)
				}
				Sentry.captureException(error)
			})
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
