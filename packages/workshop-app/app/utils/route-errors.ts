import { isRouteErrorResponse } from 'react-router'

// React Router reports its own internal 4xx ErrorResponses (unroutable URL,
// missing loader/action for the method) through the server handleError hook
// even though it has already answered the request with that 4xx status, so
// they are client mistakes, not server faults.
//
// CSRF guards are the other case. Single-fetch catches a descriptive
// origin-mismatch Error and re-reports a bare Error("Bad Request") through
// handleError while already answering with HTTP 400. Document POSTs pass the
// descriptive Error into handleError before returning 400. Neither is a
// server fault (Codespaces proxy mismatch or a cross-site probe).
function isReactRouterCsrfClientError(error: Error) {
	const { message } = error
	if (message === 'Bad Request') return true
	if (message === '`origin` header is not a valid URL. Aborting the action.') {
		return true
	}
	if (
		message ===
		'`x-forwarded-host` or `host` headers are not provided. One of these is needed to compare the `origin` header from a forwarded action request. Aborting the action.'
	) {
		return true
	}
	// host.type is "host" or "x-forwarded-host"
	return /^(?:host|x-forwarded-host) header does not match `origin` header from a forwarded action request\. Aborting the action\.$/.test(
		message,
	)
}

export function isClientErrorResponse(error: unknown) {
	if (
		isRouteErrorResponse(error) &&
		error.status >= 400 &&
		error.status < 500
	) {
		return true
	}
	return error instanceof Error && isReactRouterCsrfClientError(error)
}
