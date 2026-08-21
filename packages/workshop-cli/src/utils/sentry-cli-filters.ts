type SentryExceptionValue = {
	type?: string
	value?: string
}

type SentryEventWithException = {
	exception?: {
		values?: Array<SentryExceptionValue>
	}
	tags?: Record<string, unknown>
}

function getExceptionValues(event: SentryEventWithException) {
	return event.exception?.values ?? []
}

function exceptionValueText(value: SentryExceptionValue) {
	return typeof value.value === 'string' ? value.value : ''
}

/**
 * Handled FS-cache JSON corruption on learner machines (null-byte / truncated
 * files under epicshop Cache). readJSONWithRetries deletes and continues;
 * reporting these only produced triage noise (EPICSHOP-HK and siblings).
 */
export function isCorruptedCacheFileNoise(event: SentryEventWithException) {
	if (event.tags?.error_type === 'corrupted_cache_file') return true

	return getExceptionValues(event).some((value) => {
		const type = value.type ?? ''
		const text = exceptionValueText(value)
		if (type !== 'SyntaxError' && !/SyntaxError/i.test(text)) return false
		if (!/is not valid JSON/i.test(text)) return false
		return /[/\\]epicshop[/\\]Cache[/\\]/i.test(text)
	})
}

/**
 * Expected CLI UX: user ran an interactive command without a TTY / in CI, or
 * cancelled an inquirer prompt with Ctrl-C. Not a product defect.
 */
export function isExpectedCliSentryNoise(event: SentryEventWithException) {
	if (isCorruptedCacheFileNoise(event)) return true

	return getExceptionValues(event).some((value) => {
		const type = value.type ?? ''
		const text = exceptionValueText(value)

		if (type === 'ExitPromptError') return true
		if (/User force closed the prompt with SIGINT/i.test(text)) return true
		if (/Non-interactive environment: no TTY detected/i.test(text)) return true
		if (/CI mode: prompts are disabled/i.test(text)) return true

		// Unsupported / broken learner Node installs
		if (
			/does not provide an export named 'styleText'/i.test(text) ||
			/Cannot find package '/i.test(text)
		) {
			return true
		}

		return false
	})
}
