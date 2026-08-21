/**
 * Server-side Sentry noise that comes from learner machines (flaky disks,
 * aborted local networks, OS handle exhaustion) rather than product bugs.
 */

/**
 * @param {{ exception?: { values?: Array<{ type?: string, value?: string, stacktrace?: { frames?: Array<{ filename?: string }> } }> }, tags?: Record<string, string | number | boolean | null | undefined> }} event
 */
function getExceptionValues(event) {
	return event.exception?.values ?? []
}

/**
 * Handled FS-cache JSON corruption on learner machines (null-byte / truncated
 * files under epicshop Cache). readJSONWithRetries deletes and continues;
 * reporting these only produced triage noise (EPICSHOP-HK and siblings).
 *
 * @param {{ exception?: { values?: Array<{ type?: string, value?: string }> }, tags?: Record<string, string | number | boolean | null | undefined> }} event
 */
export function isCorruptedCacheFileNoise(event) {
	if (event.tags?.error_type === 'corrupted_cache_file') return true

	return getExceptionValues(event).some((value) => {
		const type = value.type ?? ''
		const text = typeof value.value === 'string' ? value.value : ''
		if (type !== 'SyntaxError' && !/SyntaxError/i.test(text)) return false
		if (!/is not valid JSON/i.test(text)) return false
		return /[/\\]epicshop[/\\]Cache[/\\]/i.test(text)
	})
}

/**
 * esbuild's failureErrorWithLog message when compiling learner app TS/TSX.
 * Always learner code or local dependency setup — never an epicshop product bug.
 *
 * @param {{ exception?: { values?: Array<{ type?: string, value?: string }> } }} event
 */
export function isEsbuildCompileFailureNoise(event) {
	return getExceptionValues(event).some((value) => {
		const text = typeof value.value === 'string' ? value.value : ''
		return /^Build failed with \d+ errors?:/i.test(text)
	})
}

/**
 * Learner playground / exercise sandbox failures. Stack frames are often only
 * esbuild internals; the playground path then appears only in the message.
 *
 * @param {{ exception?: { values?: Array<{ type?: string, value?: string, stacktrace?: { frames?: Array<{ filename?: string }> } }> } }} event
 */
export function isPlaygroundServerNoise(event) {
	return getExceptionValues(event).some((value) => {
		const frames = value.stacktrace?.frames ?? []
		if (
			frames.some((frame) => {
				const filename = frame.filename ?? ''
				return (
					filename.includes('/playground/') ||
					filename.includes('\\playground\\')
				)
			})
		) {
			return true
		}

		const text = typeof value.value === 'string' ? value.value : ''
		if (!text) return false

		// esbuild messages like: ../../../../playground/index.tsx:1:25: ERROR: ...
		return (
			/(?:^|[/\\])playground[/\\]/i.test(text) &&
			(/Build failed with \d+ errors?:/i.test(text) ||
				/ERROR: Could not resolve/i.test(text))
		)
	})
}

/**
 * @param {{ exception?: { values?: Array<{ type?: string, value?: string, stacktrace?: { frames?: Array<{ filename?: string }> } }> } }} event
 */
export function isServerEnvironmentNoise(event) {
	const values = getExceptionValues(event)
	return values.some((value) => {
		const type = value.type ?? ''
		const text = typeof value.value === 'string' ? value.value : ''
		if (!text && !type) return false

		if (type === 'TimeoutError' && /Task timed out after/i.test(text)) {
			return true
		}

		return (
			/ETIMEDOUT: connection timed out/i.test(text) ||
			/\bECONNRESET\b/i.test(text) ||
			/\bECONNREFUSED\b/i.test(text) ||
			/\bENOTFOUND\b/i.test(text) ||
			/socket hang up/i.test(text) ||
			/^spawn EBADF$/i.test(text) ||
			/^EPERM: operation not permitted/i.test(text) ||
			/^ENOENT: no such file or directory/i.test(text)
		)
	})
}

/**
 * @param {{ exception?: { values?: Array<{ type?: string, value?: string, stacktrace?: { frames?: Array<{ filename?: string }> } }> } }} event
 */
export function isServerSentryNoise(event) {
	return (
		isServerEnvironmentNoise(event) ||
		isEsbuildCompileFailureNoise(event) ||
		isPlaygroundServerNoise(event) ||
		isCorruptedCacheFileNoise(event)
	)
}
