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
