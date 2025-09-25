// Dynamic import of Sentry with error handling
const Sentry = await import('@sentry/react-router').catch((error) => {
	console.warn(
		'Failed to import @sentry/react-router:',
		error instanceof Error ? error.message : String(error),
		'- Sentry monitoring will be disabled but the application will continue to work normally',
	)
	return null
})

import { useEffect } from 'react'
import {
	isRouteErrorResponse,
	useParams,
	useRouteError,
	type ErrorResponse,
} from 'react-router'
import { getErrorMessage } from '#app/utils/misc.tsx'

type StatusHandler = (info: {
	error: ErrorResponse
	params: Record<string, string | undefined>
}) => React.ReactNode | null

const defaultStatusHandlers: Record<number, StatusHandler> = {
	400: ({ error }) => (
		<div>
			<h1>Bad Request</h1>
			<p>{error.data}</p>
		</div>
	),
	401: () => (
		<div>
			<h1>Unauthorized</h1>
			<p>You don't have permission to access this resource.</p>
		</div>
	),
	403: () => (
		<div>
			<h1>Forbidden</h1>
			<p>You don't have permission to access this resource.</p>
		</div>
	),
	404: () => (
		<div>
			<h1>Not Found</h1>
			<p>Sorry, we couldn't find what you were looking for.</p>
		</div>
	),
	500: ({ error }) => (
		<div>
			<h1>Internal Server Error</h1>
			<p>Sorry, something went wrong on our end.</p>
			<p>{error.data}</p>
		</div>
	),
	502: () => (
		<div>
			<h1>Bad Gateway</h1>
			<p>Sorry, we're having a temporary problem. Please try again later.</p>
			<button onClick={() => window.location.reload()}>Refresh</button>
		</div>
	),
	503: () => (
		<div>
			<h1>Service Unavailable</h1>
			<p>Sorry, we're having a temporary problem. Please try again later.</p>
			<button onClick={() => window.location.reload()}>Refresh</button>
		</div>
	),
}

export function GeneralErrorBoundary({
	className = 'container flex items-center justify-center p-20 text-h2',
	defaultStatusHandler = ({ error }) => (
		<p>
			{error.status} {error.data}
		</p>
	),
	statusHandlers: givenStatusHandlers,
	unexpectedErrorHandler = (error) => <p>{getErrorMessage(error)}</p>,
}: {
	className?: string
	defaultStatusHandler?: StatusHandler
	statusHandlers?: Record<number, StatusHandler>
	unexpectedErrorHandler?: (error: unknown) => React.ReactNode | null
}) {
	const error = useRouteError()
	const params = useParams()
	const isResponse = isRouteErrorResponse(error)
	const statusHandlers = {
		...defaultStatusHandlers,
		...givenStatusHandlers,
	}

	useEffect(() => {
		if (isResponse) return
		if (ENV.EPICSHOP_IS_PUBLISHED) {
			Sentry?.captureException(error)
		}
	}, [error, isResponse])

	if (typeof document !== 'undefined') {
		console.error(error)
	}

	return (
		<div className={className}>
			{isRouteErrorResponse(error)
				? (statusHandlers?.[error.status] ?? defaultStatusHandler)({
						error,
						params,
					})
				: unexpectedErrorHandler(error)}
		</div>
	)
}
