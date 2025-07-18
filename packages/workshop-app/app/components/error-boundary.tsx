import { captureException } from '@sentry/react-router'
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

export function GeneralErrorBoundary({
	defaultStatusHandler = ({ error }) => (
		<p>
			{error.status} {error.data}
		</p>
	),
	statusHandlers,
	unexpectedErrorHandler = (error) => <p>{getErrorMessage(error)}</p>,
}: {
	defaultStatusHandler?: StatusHandler
	statusHandlers?: Record<number, StatusHandler>
	unexpectedErrorHandler?: (error: unknown) => React.ReactNode | null
}) {
	const error = useRouteError()
	const params = useParams()
	const isResponse = isRouteErrorResponse(error)

	useEffect(() => {
		if (isResponse) return
		if (ENV.EPICSHOP_IS_PUBLISHED) {
			captureException(error)
		}
	}, [error, isResponse])

	if (typeof document !== 'undefined') {
		console.error(error)
	}

	return (
		<div className="container flex items-center justify-center p-20 text-h2">
			{isRouteErrorResponse(error)
				? (statusHandlers?.[error.status] ?? defaultStatusHandler)({
						error,
						params,
					})
				: unexpectedErrorHandler(error)}
		</div>
	)
}
