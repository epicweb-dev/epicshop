import { isRouteErrorResponse } from 'react-router'

// React Router reports its own internal 4xx ErrorResponses (unroutable URL,
// missing loader/action for the method) through the server handleError hook
// even though it has already answered the request with that 4xx status, so
// they are client mistakes, not server faults.
//
// The single-fetch CSRF guard is the other case: it catches a descriptive
// origin-mismatch Error and re-reports a bare Error("Bad Request") through
// handleError while already answering with HTTP 400. That is not a server
// fault (Codespaces proxy mismatch or a cross-site probe).
export function isClientErrorResponse(error: unknown) {
	if (
		isRouteErrorResponse(error) &&
		error.status >= 400 &&
		error.status < 500
	) {
		return true
	}
	return error instanceof Error && error.message === 'Bad Request'
}
