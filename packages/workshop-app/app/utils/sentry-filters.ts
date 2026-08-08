type SentryExceptionValue = {
	type?: string
	value?: string
	stacktrace?: {
		frames?: Array<{
			filename?: string
			function?: string
			module?: string
			inApp?: boolean
		}>
	}
}

type SentryBreadcrumb = {
	category?: string
	message?: string
	level?: string
	data?: {
		arguments?: Array<unknown>
	}
}

type SentryEventWithException = {
	exception?: {
		values?: Array<SentryExceptionValue>
	}
	request?: {
		url?: string
	}
	breadcrumbs?: Array<SentryBreadcrumb> | { values?: Array<SentryBreadcrumb> }
}

export const processingPictureInPictureRequestMessage =
	'The video element is processing a Picture-in-Picture request.'

/** Firefox (and some Chromium builds) when PiP is requested without transient activation. */
export const pictureInPictureRequiresUserActivationMessage =
	'Picture-in-Picture requires user activation'

const pictureInPictureNotAllowedMessages = [
	processingPictureInPictureRequestMessage,
	pictureInPictureRequiresUserActivationMessage,
] as const

function getExceptionValues(event: SentryEventWithException) {
	return event.exception?.values ?? []
}

function exceptionValueText(value: SentryExceptionValue) {
	return typeof value.value === 'string' ? value.value : ''
}

/**
 * media-chrome / Mux Player PiP requests can reject with NotAllowedError when
 * the browser drops transient user activation or another PiP request is in
 * flight. Expected browser policy — not an actionable product defect.
 */
export function isProcessingPictureInPictureRequest(
	event: SentryEventWithException,
) {
	return getExceptionValues(event).some(
		(value) =>
			value.type === 'NotAllowedError' &&
			pictureInPictureNotAllowedMessages.some(
				(message) => value.value === message,
			),
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
 * React Router single-fetch throws when the client asks for a routeId that
 * isn't in the server payload — typically a tab left open across a local
 * restart or a deployed workshop update (client/server route-manifest skew).
 * Not an actionable product defect; a hard refresh recovers.
 */
export function isStaleRouteResultNoise(event: SentryEventWithException) {
	return getExceptionValues(event).some((value) =>
		/No result found for routeId /i.test(exceptionValueText(value)),
	)
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

function getBreadcrumbs(event: SentryEventWithException) {
	const crumbs = event.breadcrumbs
	if (!crumbs) return []
	return Array.isArray(crumbs) ? crumbs : (crumbs.values ?? [])
}

function breadcrumbTextBlob(event: SentryEventWithException) {
	const parts: Array<string> = []
	for (const crumb of getBreadcrumbs(event)) {
		if (typeof crumb.message === 'string') parts.push(crumb.message)
		for (const arg of crumb.data?.arguments ?? []) {
			if (typeof arg === 'string') {
				parts.push(arg)
				continue
			}
			if (arg && typeof arg === 'object') {
				const record = arg as { message?: unknown; stack?: unknown }
				if (typeof record.message === 'string') parts.push(record.message)
				if (typeof record.stack === 'string') parts.push(record.stack)
			}
		}
	}
	return parts.join('\n')
}

function isReactRenderLoopFatal(event: SentryEventWithException) {
	return getExceptionValues(event).some((value) => {
		const text = exceptionValueText(value)
		return (
			/Maximum update depth exceeded/i.test(text) ||
			/^Should not already be working\.?$/i.test(text) ||
			/Minified React error #185/i.test(text)
		)
	})
}

/**
 * Browser extensions that wrap addEventListener (`addEL_hook`) throw
 * `Cannot read properties of null (reading 'tagName')` while React mounts
 * effects. React Router catches the throw during render/effect recovery, which
 * then fatals as "Maximum update depth exceeded" / "Should not already be
 * working" with only react-dom frames — so the underlying extension filter
 * never matches. Drop these cascade fatals when breadcrumbs show the hook.
 */
export function isReactExtensionRenderLoopNoise(
	event: SentryEventWithException,
) {
	if (!isReactRenderLoopFatal(event)) return false

	const crumbText = breadcrumbTextBlob(event)
	if (/addEL_hook/i.test(crumbText)) return true
	return (
		/reading ['"]tagName['"]/i.test(crumbText) &&
		/React Router caught/i.test(crumbText)
	)
}

/**
 * React Router sanitizes production single-fetch errors to this opaque message
 * with no stack. The actionable server exception (when any) is reported via
 * handleError; the client mirror is never actionable on its own.
 */
export function isUnexpectedServerErrorNoise(event: SentryEventWithException) {
	return getExceptionValues(event).some(
		(value) =>
			value.type === 'Error' &&
			exceptionValueText(value) === 'Unexpected Server Error',
	)
}

export function isClientSentryNoise(event: SentryEventWithException) {
	return (
		isProcessingPictureInPictureRequest(event) ||
		isAbortErrorNoise(event) ||
		isStaleRouteResultNoise(event) ||
		isBrowserNetworkNoise(event) ||
		isSessionStorageAccessDenied(event) ||
		isCrossOriginSecurityNoise(event) ||
		isBrowserExtensionNoise(event) ||
		isDomMutationNoise(event) ||
		isPlaygroundClientNoise(event) ||
		isReactExtensionRenderLoopNoise(event) ||
		isUnexpectedServerErrorNoise(event)
	)
}
