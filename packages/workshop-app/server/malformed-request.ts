import { type NextFunction, type Request, type Response } from 'express'

/**
 * Returns a short reason when the request target cannot be routed safely, or
 * null when it is fine. Only the path (before `?`) is inspected.
 *
 * Backslash and protocol-relative (`//`) paths are rejected because
 * react-router's SSR `encodeLocation` calls `new URL()` on matched pathnames
 * and throws `TypeError: Invalid URL` for those inputs.
 */
export function getMalformedRequestReason(
	requestTarget: string,
): string | null {
	const path = requestTarget.split('?')[0] ?? ''

	let decoded: string
	try {
		decoded = decodeURIComponent(path)
	} catch {
		return 'undecodable percent-encoding'
	}

	for (const char of decoded) {
		const code = char.charCodeAt(0)
		if (code <= 0x1f || code === 0x7f) {
			return 'control characters in path'
		}
	}

	if (decoded.includes('\\')) {
		return 'backslash in path'
	}

	if (decoded.startsWith('//')) {
		return 'protocol-relative path'
	}

	return null
}

// morgan logs from an on-finished listener, so letting decodeURIComponent
// throw there is an uncaught exception that takes the whole process down.
export function decodeRequestTarget(requestTarget: string) {
	try {
		return decodeURIComponent(requestTarget)
	} catch {
		return requestTarget
	}
}

export function rejectMalformedRequests(
	req: Request,
	res: Response,
	next: NextFunction,
) {
	const reason = getMalformedRequestReason(req.url ?? '')
	if (reason) {
		res.status(400).type('text/plain').send(`Bad Request: ${reason}`)
		return
	}
	next()
}
