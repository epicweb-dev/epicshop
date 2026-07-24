type SentryExceptionValue = {
	type?: string
	value?: string
	stacktrace?: {
		frames?: Array<{
			filename?: string
			function?: string
		}>
	}
}

type SentryEventWithException = {
	exception?: {
		values?: Array<SentryExceptionValue>
	}
	request?: {
		url?: string
	}
}

export const processingPictureInPictureRequestMessage =
	'The video element is processing a Picture-in-Picture request.'

function getExceptionValues(event: SentryEventWithException) {
	return event.exception?.values ?? []
}

function exceptionValueText(value: SentryExceptionValue) {
	return typeof value.value === 'string' ? value.value : ''
}

export function isProcessingPictureInPictureRequest(
	event: SentryEventWithException,
) {
	return getExceptionValues(event).some(
		(value) =>
			value.type === 'NotAllowedError' &&
			value.value === processingPictureInPictureRequestMessage,
	)
}

/**
 * Learners navigate away / HMR reloads / connection-status polls abort in-flight
 * fetches. These AbortErrors are not actionable product defects.
 */
export function isAbortErrorNoise(event: SentryEventWithException) {
	return getExceptionValues(event).some((value) => {
		if (value.type === 'AbortError') return true
		const text = exceptionValueText(value)
		return (
			/signal is aborted without reason/i.test(text) ||
			/BodyStreamBuffer was aborted/i.test(text) ||
			/Fetch is aborted/i.test(text) ||
			/The operation was aborted/i.test(text)
		)
	})
}

/**
 * Browser/network blips while the local (or hosted) workshop server flaps,
 * the tab sleeps, or the learner's connection drops mid-fetch.
 */
export function isBrowserNetworkNoise(event: SentryEventWithException) {
	return getExceptionValues(event).some((value) => {
		// Firefox often reports this network abort with an empty message.
		if (value.type === 'NS_ERROR_NOT_AVAILABLE') return true

		const text = exceptionValueText(value)
		if (!text) return false
		return (
			/Failed to fetch/i.test(text) ||
			/NetworkError when attempting to fetch resource/i.test(text) ||
			/^Load failed/i.test(text) ||
			/^network error$/i.test(text) ||
			/^fetch failed$/i.test(text) ||
			/^terminated$/i.test(text)
		)
	})
}

export function isSessionStorageAccessDenied(event: SentryEventWithException) {
	return getExceptionValues(event).some((value) => {
		const text = exceptionValueText(value)
		return (
			value.type === 'SecurityError' &&
			/sessionStorage/i.test(text) &&
			/Access is denied/i.test(text)
		)
	})
}

export function isCrossOriginSecurityNoise(event: SentryEventWithException) {
	return getExceptionValues(event).some((value) => {
		const text = exceptionValueText(value)
		if (value.type === 'SecurityError' && /cross-origin/i.test(text)) {
			return true
		}
		return /Permission denied to access property/i.test(text)
	})
}

export function isBrowserExtensionNoise(event: SentryEventWithException) {
	const extensionGlobalKeywords = ['__firefox__', 'ethereum']
	const extensionFrameHints = [
		'chrome-extension:',
		'moz-extension:',
		'contentScriptVisibilityChanged',
		'addEL_hook',
		'inBrowserBrowserRef',
	]

	for (const value of getExceptionValues(event)) {
		const text = exceptionValueText(value)
		if (
			extensionGlobalKeywords.some((keyword) => text.includes(keyword)) ||
			/contentScriptVisibilityChanged/i.test(text) ||
			/inBrowserBrowserRef/i.test(text)
		) {
			return true
		}

		const frames = value.stacktrace?.frames ?? []
		if (
			frames.some((frame) => {
				const filename = frame.filename ?? ''
				const fn = frame.function ?? ''
				return extensionFrameHints.some(
					(hint) => filename.includes(hint) || fn.includes(hint),
				)
			})
		) {
			return true
		}
	}

	if (event.request?.url) {
		try {
			const url = new URL(event.request.url)
			if (
				url.protocol === 'chrome-extension:' ||
				url.protocol === 'moz-extension:'
			) {
				return true
			}
		} catch {
			// ignore invalid URLs
		}
	}

	return false
}

export function isDomMutationNoise(event: SentryEventWithException) {
	return getExceptionValues(event).some((value) => {
		const text = exceptionValueText(value)
		if (!text) return false
		return /insertBefore/i.test(text) || /removeChild/i.test(text)
	})
}

/** Learner playground / exercise sandbox code should not page on-call. */
export function isPlaygroundClientNoise(event: SentryEventWithException) {
	return getExceptionValues(event).some((value) =>
		value.stacktrace?.frames?.some((frame) =>
			frame.filename?.includes('/playground/'),
		),
	)
}

export function isClientSentryNoise(event: SentryEventWithException) {
	return (
		isProcessingPictureInPictureRequest(event) ||
		isAbortErrorNoise(event) ||
		isBrowserNetworkNoise(event) ||
		isSessionStorageAccessDenied(event) ||
		isCrossOriginSecurityNoise(event) ||
		isBrowserExtensionNoise(event) ||
		isDomMutationNoise(event) ||
		isPlaygroundClientNoise(event)
	)
}
