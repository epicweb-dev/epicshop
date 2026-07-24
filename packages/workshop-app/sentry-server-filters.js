/**
 * Server-side Sentry noise that comes from learner machines (flaky disks,
 * aborted local networks, OS handle exhaustion) rather than product bugs.
 */

/**
 * @param {{ exception?: { values?: Array<{ type?: string, value?: string }> } }} event
 */
export function isServerEnvironmentNoise(event) {
	const values = event.exception?.values ?? []
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
