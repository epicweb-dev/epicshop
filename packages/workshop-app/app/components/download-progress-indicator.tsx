import * as React from 'react'
import { cn } from '#app/utils/misc.tsx'

export type DownloadProgressIndicatorProps = {
	/**
	 * Progress value from 0 to 100. If undefined, shows indeterminate animation.
	 */
	progress?: number
	/**
	 * Size of the indicator in pixels. Defaults to 16.
	 */
	size?: number
	/**
	 * Stroke width of the circle. Defaults to 2.
	 */
	strokeWidth?: number
	className?: string
}

/**
 * A circular progress indicator for showing download progress.
 * Shows a spinning animation when progress is undefined (indeterminate).
 * Shows a filling circle when progress is a number (determinate).
 */
export function DownloadProgressIndicator({
	progress,
	size = 16,
	strokeWidth = 2,
	className,
}: DownloadProgressIndicatorProps) {
	const isIndeterminate = progress === undefined
	const radius = (size - strokeWidth) / 2
	const circumference = 2 * Math.PI * radius
	const center = size / 2

	// Clamp progress between 0 and 100
	const clampedProgress =
		progress !== undefined ? Math.min(100, Math.max(0, progress)) : 0
	const strokeDashoffset =
		circumference - (clampedProgress / 100) * circumference

	return (
		<svg
			width={size}
			height={size}
			viewBox={`0 0 ${size} ${size}`}
			className={cn(
				isIndeterminate && 'animate-spin',
				'text-current',
				className,
			)}
			role="progressbar"
			aria-valuenow={isIndeterminate ? undefined : clampedProgress}
			aria-valuemin={0}
			aria-valuemax={100}
			aria-label={
				isIndeterminate
					? 'Downloading...'
					: `Download progress: ${clampedProgress}%`
			}
		>
			{/* Background circle */}
			<circle
				cx={center}
				cy={center}
				r={radius}
				fill="none"
				stroke="currentColor"
				strokeWidth={strokeWidth}
				opacity={0.25}
			/>
			{/* Progress circle */}
			<circle
				cx={center}
				cy={center}
				r={radius}
				fill="none"
				stroke="currentColor"
				strokeWidth={strokeWidth}
				strokeLinecap="round"
				strokeDasharray={circumference}
				strokeDashoffset={
					isIndeterminate ? circumference * 0.75 : strokeDashoffset
				}
				transform={`rotate(-90 ${center} ${center})`}
				className={cn(
					!isIndeterminate &&
						'transition-[stroke-dashoffset] duration-300 ease-out',
				)}
			/>
		</svg>
	)
}
