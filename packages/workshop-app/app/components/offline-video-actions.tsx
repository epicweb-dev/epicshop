import * as React from 'react'
import { SimpleTooltip } from '#app/components/ui/tooltip.tsx'

function DownloadIcon(props: React.ComponentPropsWithoutRef<'svg'>) {
	return (
		<svg viewBox="0 0 20 20" aria-hidden="true" {...props}>
			<path
				fill="currentColor"
				d="M10 2a1 1 0 0 1 1 1v7.59l2.3-2.3a1 1 0 1 1 1.4 1.42l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.42l2.3 2.3V3a1 1 0 0 1 1-1Zm-6 12a1 1 0 0 1 1 1v1h10v-1a1 1 0 1 1 2 0v2a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1Z"
			/>
		</svg>
	)
}

function DeleteIcon(props: React.ComponentPropsWithoutRef<'svg'>) {
	return (
		<svg viewBox="0 0 20 20" aria-hidden="true" {...props}>
			<path
				fill="currentColor"
				d="M7 2a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1h4a1 1 0 1 1 0 2h-1.1l-1.2 11A2 2 0 0 1 12.7 20H7.3a2 2 0 0 1-1.99-1.99L4.1 5H3a1 1 0 0 1 0-2h4V2Zm1 1v0h4V3H8Zm0 5a1 1 0 0 0-2 0v7a1 1 0 0 0 2 0V8Zm5-1a1 1 0 0 0-1 1v7a1 1 0 1 0 2 0V8a1 1 0 0 0-1-1Z"
			/>
		</svg>
	)
}

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
	const IconComponent = isAvailable ? DeleteIcon : DownloadIcon

	return (
		<SimpleTooltip content={label}>
			<button
				type="button"
				onClick={onClick}
				disabled={isBusy}
				className={`${className} inline-flex h-7 w-7 items-center justify-center rounded disabled:cursor-not-allowed disabled:opacity-50`}
				aria-label={label}
			>
				<IconComponent className="h-4 w-4" />
			</button>
		</SimpleTooltip>
	)
}
