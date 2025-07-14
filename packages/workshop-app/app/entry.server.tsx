import { PassThrough } from 'stream'
import { createReadableStreamFromReadable } from '@react-router/node'
import * as Sentry from '@sentry/react-router'
import { isbot } from 'isbot'
import { renderToPipeableStream } from 'react-dom/server'
import {
	type EntryContext,
	ServerRouter,
	type LoaderFunctionArgs,
	type ActionFunctionArgs,
} from 'react-router'

export const streamTimeout = 15000
const ABORT_DELAY = streamTimeout + 1000

export function handleError(
	error: unknown,
	{ request }: LoaderFunctionArgs | ActionFunctionArgs,
): void {
	if (request.signal.aborted) return
	if (ENV.EPICSHOP_IS_PUBLISHED) {
		// Add correlation ID to error context
		const correlationId = request.headers.get('x-correlation-id')
		if (correlationId) {
			Sentry.withScope((scope) => {
				scope.setTag('correlationId', correlationId)
				scope.setExtra('correlationId', correlationId)
				scope.setContext('correlation', {
					id: correlationId,
					timestamp: new Date().toISOString(),
					url: request.url,
					method: request.method,
				})
				Sentry.captureException(error)
			})
		} else {
			Sentry.captureException(error)
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
