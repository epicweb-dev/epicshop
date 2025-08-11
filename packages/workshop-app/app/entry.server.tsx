import { PassThrough } from 'stream'
import { createReadableStreamFromReadable } from '@react-router/node'
// Dynamic import of Sentry with error handling
let Sentry: any = null

await import('@sentry/react-router')
	.then(module => { Sentry = module })
	.catch(error => console.warn('Failed to import @sentry/react-router:', error.message))

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

export function handleError(
	error: unknown,
	{ request }: LoaderFunctionArgs | ActionFunctionArgs,
): void {
	if (request.signal.aborted) return
	if (ENV.EPICSHOP_IS_PUBLISHED && Sentry) {
		Sentry.captureException(error)
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
