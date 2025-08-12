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
	useLoaderData,
	type ErrorResponse,
} from 'react-router'
import { getErrorMessage } from '#app/utils/misc.tsx'
import { useSentryUser } from '../hooks/use-sentry-user'

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
	unexpectedErrorHandler?: (error: unknown) => React.ReactNode | null
}: {
	defaultStatusHandler?: StatusHandler
	statusHandlers?: Record<number, StatusHandler>
	unexpectedErrorHandler?: (error: unknown) => React.ReactNode | null
}) {
	const error = useRouteError()
	const params = useParams()
	const isResponse = isRouteErrorResponse(error)
	
	// Try to get user data from loader data if available
	let userId: string | undefined
	let userType: string | undefined
	
	try {
		const loaderData = useLoaderData()
		if (loaderData?.userId) {
			userId = loaderData.userId.id
			userType = loaderData.userId.type
		}
	} catch {
		// Ignore errors when loader data is not available
	}
	
	// Set Sentry user context for error reporting
	useSentryUser(userId, userType)

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
