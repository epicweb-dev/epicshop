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
	mechanism?: {
		type?: string
		data?: {
			error_type?: string
		}
	}
	stacktrace?: {
		frames?: Array<{
			function?: string
			module?: string
			filename?: string
		}>
	}
}

type SentryEventWithException = {
	culprit?: string
	exception?: {
		values?: Array<SentryExceptionValue>
	}
}

export function isExpectedMcpErrorMessage(message: string) {
	return expectedMcpErrorMessagePatterns.some((pattern) =>
		pattern.test(message),
	)
}

/**
 * MCP hosts sometimes send malformed JSON-RPC frames on stdio. The SDK's
 * deserializeMessage validates with Zod and throws ZodError (transport noise),
 * which Sentry's MCP integration captures as mechanism auto.ai.mcp_server.
 */
function isMcpTransportDeserializeZodError(
	event: SentryEventWithException,
	value: SentryExceptionValue,
) {
	if (value.type !== 'ZodError') return false

	if (
		value.mechanism?.type === 'auto.ai.mcp_server' &&
		value.mechanism.data?.error_type === 'transport'
	) {
		return true
	}

	if (event.culprit?.includes('deserializeMessage')) return true

	return (value.stacktrace?.frames ?? []).some((frame) => {
		if (frame.function !== 'deserializeMessage') return false
		const location = `${frame.module ?? ''} ${frame.filename ?? ''}`
		return (
			location.includes('@modelcontextprotocol') || location.includes('stdio')
		)
	})
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
			if (isMcpTransportDeserializeZodError(event, value)) return true
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
