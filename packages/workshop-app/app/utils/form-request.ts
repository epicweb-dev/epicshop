import { data } from 'react-router'

/**
 * Exact undici / Node Request.formData() message when Content-Type is not a
 * form media type (EPICSHOP-J3). Client probes with application/json etc.
 * make request.formData() throw this TypeError.
 */
export const undiciFormDataContentTypeErrorRe =
	/Content-Type was not one of "multipart\/form-data" or "application\/x-www-form-urlencoded"/

export function isUndiciFormDataContentTypeError(error: unknown) {
	return (
		error instanceof Error &&
		undiciFormDataContentTypeErrorRe.test(error.message)
	)
}

/**
 * True when Content-Type is urlencoded or multipart form data (charset /
 * boundary params allowed). Case-insensitive.
 */
export function isFormContentType(request: Request) {
	const contentType = request.headers.get('content-type')
	if (!contentType) return false
	const mediaType = contentType.split(';', 1)[0]?.trim().toLowerCase()
	return (
		mediaType === 'application/x-www-form-urlencoded' ||
		mediaType === 'multipart/form-data'
	)
}

/**
 * Throws a React Router 400 ErrorResponse when the request cannot safely call
 * request.formData() (wrong or missing Content-Type).
 */
export function requireFormContentType(request: Request) {
	if (!isFormContentType(request)) {
		throw data(
			{ error: 'Content-Type must be a form media type' },
			{ status: 400 },
		)
	}
}
