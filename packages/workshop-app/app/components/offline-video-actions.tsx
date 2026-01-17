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
		<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
			<path
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth="1.5"
				d="M6.75 7.75L7.59115 17.4233C7.68102 18.4568 8.54622 19.25 9.58363 19.25H14.4164C15.4538 19.25 16.319 18.4568 16.4088 17.4233L17.25 7.75"
			/>
			<path
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth="1.5"
				d="M9.75 7.5V6.75C9.75 5.64543 10.6454 4.75 11.75 4.75H12.25C13.3546 4.75 14.25 5.64543 14.25 6.75V7.5"
			/>
			<path
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth="1.5"
				d="M5 7.75H19"
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
