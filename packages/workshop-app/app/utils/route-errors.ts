import { isRouteErrorResponse } from 'react-router'

// React Router reports its own internal 4xx ErrorResponses (unroutable URL,
// missing loader/action for the method) through the server handleError hook
// even though it has already answered the request with that 4xx status, so
// they are client mistakes, not server faults.
export function isClientErrorResponse(error: unknown) {
	return (
		isRouteErrorResponse(error) && error.status >= 400 && error.status < 500
	)
}
