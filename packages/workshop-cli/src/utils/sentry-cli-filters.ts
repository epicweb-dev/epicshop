type SentryExceptionValue = {
	type?: string
	value?: string
}

type SentryEventWithException = {
	exception?: {
		values?: Array<SentryExceptionValue>
	}
}

function getExceptionValues(event: SentryEventWithException) {
	return event.exception?.values ?? []
}

function exceptionValueText(value: SentryExceptionValue) {
	return typeof value.value === 'string' ? value.value : ''
}

/**
 * Expected CLI UX: user ran an interactive command without a TTY / in CI, or
 * cancelled an inquirer prompt with Ctrl-C. Not a product defect.
 */
export function isExpectedCliSentryNoise(event: SentryEventWithException) {
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
