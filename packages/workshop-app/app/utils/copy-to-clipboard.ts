export const clipboardUnavailableMessage =
	'Copying is only available in secure contexts (HTTPS or localhost).'

export type CopyToClipboardResult =
	| { status: 'copied' }
	| { status: 'unavailable' }
	| { status: 'failed'; error: unknown }

export async function copyToClipboard(
	text: string,
): Promise<CopyToClipboardResult> {
	if (!navigator.clipboard) {
		return { status: 'unavailable' }
	}

	try {
		await navigator.clipboard.writeText(text)
		return { status: 'copied' }
	} catch (error) {
		return { status: 'failed', error }
	}
}
