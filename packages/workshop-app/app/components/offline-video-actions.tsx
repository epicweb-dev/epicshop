import * as React from 'react'

export type OfflineVideoActionButtonsProps = {
	isAvailable: boolean
	isBusy?: boolean
	onDownload: () => void
	onDelete: () => void
}

export function OfflineVideoActionButtons({
	isAvailable,
	isBusy = false,
	onDownload,
	onDelete,
}: OfflineVideoActionButtonsProps) {
	const label = isAvailable ? 'Delete offline video' : 'Download offline video'
	const onClick = isAvailable ? onDelete : onDownload
	const className = isAvailable
		? 'text-foreground-destructive hover:bg-foreground-destructive/10'
		: 'text-foreground hover:bg-muted'

	return (
		<button
			type="button"
			onClick={onClick}
			disabled={isBusy}
			className={`${className} inline-flex items-center rounded px-2 py-1 text-sm underline disabled:cursor-not-allowed disabled:opacity-50`}
			aria-label={label}
		>
			{label}
		</button>
	)
}
