/**
 * Expected client/agent mistakes (wrong cwd, missing workshop root, etc.).
 * These are useful as MCP error responses, but not as Sentry issues.
 */
export class ExpectedMcpError extends Error {
	override name = 'ExpectedMcpError'
}

const expectedMcpErrorMessagePatterns = [
	/^No workshop directory found while searching upward from /,
	/^The workshop directory is required$/,
	// Historical message from before relative workshop paths were allowed.
	/^The workshop directory must be an absolute path$/,
	/^Received what looks like an unexpanded shell variable /,
	/^Exercise number must be a number/,
	// Electron/Cursor host sometimes prepends env noise onto MCP stdio JSON-RPC frames
	/ELECTRON_R.*is not valid JSON/i,
	/Unexpected token 'E', " ELECTRON_R"/i,
]

type SentryExceptionValue = {
	type?: string
	value?: string
}

type SentryEventWithException = {
	exception?: {
		values?: Array<SentryExceptionValue>
	}
}

export function isExpectedMcpErrorMessage(message: string) {
	return expectedMcpErrorMessagePatterns.some((pattern) =>
		pattern.test(message),
	)
}

export function isExpectedMcpSentryNoise(
	event: SentryEventWithException,
	hint?: { originalException?: unknown },
) {
	if (hint?.originalException instanceof ExpectedMcpError) return true

	if (
		hint?.originalException &&
		typeof hint.originalException === 'object' &&
		'message' in hint.originalException &&
		typeof hint.originalException.message === 'string' &&
		isExpectedMcpErrorMessage(hint.originalException.message)
	) {
		return true
	}

	return (
		event.exception?.values?.some((value) => {
			if (value.type === 'ExpectedMcpError') return true
			if (
				typeof value.value === 'string' &&
				isExpectedMcpErrorMessage(value.value)
			) {
				return true
			}
			return false
		}) ?? false
	)
}
