type SentryExceptionValue = {
	type?: string
	value?: string
}

type SentryEventWithException = {
	exception?: {
		values?: Array<SentryExceptionValue>
	}
}

export const processingPictureInPictureRequestMessage =
	'The video element is processing a Picture-in-Picture request.'

export function isProcessingPictureInPictureRequest(
	event: SentryEventWithException,
) {
	return (
		event.exception?.values?.some(
			(value) =>
				value.type === 'NotAllowedError' &&
				value.value === processingPictureInPictureRequestMessage,
		) ?? false
	)
}
