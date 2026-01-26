import * as React from 'react'
import { cn } from '#app/utils/misc.tsx'

type MediaElementLike = {
	currentTime: number
	duration: number
	addEventListener?: EventTarget['addEventListener']
	removeEventListener?: EventTarget['removeEventListener']
}

type TimelineZoomProps = {
	mediaRef: React.RefObject<MediaElementLike | null>
	className?: string
}

const MIN_WINDOW_SECONDS = 2
const MAX_ZOOM = 20
const EPSILON = 0.001

function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value))
}

function formatTime(seconds: number) {
	if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
	const totalSeconds = Math.floor(seconds)
	const hours = Math.floor(totalSeconds / 3600)
	const minutes = Math.floor((totalSeconds % 3600) / 60)
	const secs = totalSeconds % 60
	const tenths = Math.floor((seconds - totalSeconds) * 10)
	if (hours > 0) {
		return `${hours}:${minutes.toString().padStart(2, '0')}:${secs
			.toString()
			.padStart(2, '0')}.${tenths}`
	}
	return `${minutes}:${secs.toString().padStart(2, '0')}.${tenths}`
}

export function TimelineZoom({ mediaRef, className }: TimelineZoomProps) {
	const [duration, setDuration] = React.useState(0)
	const [currentTime, setCurrentTime] = React.useState(0)
	const [zoom, setZoom] = React.useState(1)
	const [windowStart, setWindowStart] = React.useState(0)
	const mediaElement = mediaRef.current

	React.useEffect(() => {
		if (!mediaElement) return
		const updateDuration = () => {
			const nextDuration = Number.isFinite(mediaElement.duration)
				? mediaElement.duration
				: 0
			setDuration(nextDuration)
		}
		const updateTime = () => {
			const nextTime = Number.isFinite(mediaElement.currentTime)
				? mediaElement.currentTime
				: 0
			setCurrentTime(nextTime)
		}

		updateDuration()
		updateTime()

		mediaElement.addEventListener?.('timeupdate', updateTime)
		mediaElement.addEventListener?.('durationchange', updateDuration)
		mediaElement.addEventListener?.('loadedmetadata', updateDuration)

		return () => {
			mediaElement.removeEventListener?.('timeupdate', updateTime)
			mediaElement.removeEventListener?.('durationchange', updateDuration)
			mediaElement.removeEventListener?.('loadedmetadata', updateDuration)
		}
	}, [mediaElement])

	const safeDuration = Number.isFinite(duration) ? duration : 0
	const maxZoom = safeDuration
		? Math.min(
				MAX_ZOOM,
				Math.max(1, Math.floor(safeDuration / MIN_WINDOW_SECONDS)),
			)
		: 1
	const clampedZoom = clamp(zoom, 1, maxZoom)

	React.useEffect(() => {
		if (zoom !== clampedZoom) setZoom(clampedZoom)
	}, [zoom, clampedZoom])

	const windowSize = safeDuration ? safeDuration / clampedZoom : 0
	const maxWindowStart = Math.max(0, safeDuration - windowSize)
	const windowEnd = windowStart + windowSize
	const isReady = safeDuration > 0

	React.useEffect(() => {
		if (!isReady) return
		const nextStart = clamp(windowStart, 0, maxWindowStart)
		if (Math.abs(nextStart - windowStart) > EPSILON) {
			setWindowStart(nextStart)
		}
	}, [isReady, windowStart, maxWindowStart])

	React.useEffect(() => {
		if (!isReady) return
		if (currentTime >= windowStart && currentTime <= windowEnd) return
		const centeredStart = clamp(currentTime - windowSize / 2, 0, maxWindowStart)
		if (Math.abs(centeredStart - windowStart) > EPSILON) {
			setWindowStart(centeredStart)
		}
	}, [currentTime, isReady, maxWindowStart, windowEnd, windowSize, windowStart])

	const handleZoomChange = (value: number) => {
		const nextZoom = clamp(value, 1, maxZoom)
		const nextWindowSize = safeDuration ? safeDuration / nextZoom : 0
		const nextWindowStart = clamp(
			currentTime - nextWindowSize / 2,
			0,
			Math.max(0, safeDuration - nextWindowSize),
		)
		setZoom(nextZoom)
		setWindowStart(nextWindowStart)
	}

	const handleScrub = (nextTime: number) => {
		const media = mediaRef.current
		if (media) {
			media.currentTime = nextTime
		}
		setCurrentTime(nextTime)
	}

	const scrubStep = windowSize ? Math.max(0.01, windowSize / 200) : 0.1
	const panStep = windowSize ? Math.max(0.1, windowSize / 20) : 0.1
	const scrubValue = clamp(currentTime, windowStart, windowEnd)

	return (
		<div
			className={cn(
				'border-border bg-muted/20 rounded-md border px-3 py-3',
				className,
			)}
		>
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div className="text-sm font-medium">Timeline zoom</div>
				<div className="text-muted-foreground text-xs tabular-nums">
					{isReady
						? `${formatTime(windowStart)} - ${formatTime(windowEnd)}`
						: 'Loading timeline...'}
				</div>
			</div>
			<div className="mt-3 grid gap-3">
				<div className="flex flex-wrap items-center gap-2 text-xs">
					<span className="text-muted-foreground">Zoom</span>
					<button
						type="button"
						disabled={!isReady || clampedZoom <= 1}
						onClick={() => handleZoomChange(clampedZoom - 1)}
						className="border-border bg-background text-foreground hover:bg-muted rounded border px-2 py-1 disabled:cursor-not-allowed disabled:opacity-50"
						aria-label="Zoom out"
					>
						-
					</button>
					<input
						type="range"
						min={1}
						max={maxZoom}
						step={1}
						value={clampedZoom}
						onChange={(event) =>
							handleZoomChange(Number(event.currentTarget.value))
						}
						disabled={!isReady || maxZoom === 1}
						className="accent-foreground h-2 flex-1"
						aria-label="Zoom level"
					/>
					<button
						type="button"
						disabled={!isReady || clampedZoom >= maxZoom}
						onClick={() => handleZoomChange(clampedZoom + 1)}
						className="border-border bg-background text-foreground hover:bg-muted rounded border px-2 py-1 disabled:cursor-not-allowed disabled:opacity-50"
						aria-label="Zoom in"
					>
						+
					</button>
					<button
						type="button"
						disabled={!isReady || clampedZoom === 1}
						onClick={() => handleZoomChange(1)}
						className="text-muted-foreground hover:text-foreground px-2 py-1"
					>
						Reset
					</button>
					<span className="text-muted-foreground tabular-nums">
						{clampedZoom}x
					</span>
				</div>
				<div className="flex flex-wrap items-center gap-2 text-xs">
					<span className="text-muted-foreground">Window</span>
					<input
						type="range"
						min={0}
						max={maxWindowStart}
						step={panStep}
						value={windowStart}
						onChange={(event) =>
							setWindowStart(Number(event.currentTarget.value))
						}
						disabled={!isReady || maxWindowStart === 0}
						className="accent-foreground h-2 flex-1"
						aria-label="Timeline window position"
					/>
					<button
						type="button"
						disabled={!isReady}
						onClick={() =>
							setWindowStart(
								clamp(currentTime - windowSize / 2, 0, maxWindowStart),
							)
						}
						className="text-muted-foreground hover:text-foreground px-2 py-1"
					>
						Center
					</button>
				</div>
				<div className="flex flex-wrap items-center gap-2 text-xs">
					<span className="text-muted-foreground">Playhead</span>
					<button
						type="button"
						disabled={!isReady}
						onClick={() => handleScrub(Math.max(0, currentTime - 1))}
						className="border-border bg-background text-foreground hover:bg-muted rounded border px-2 py-1 disabled:cursor-not-allowed disabled:opacity-50"
					>
						-1s
					</button>
					<input
						type="range"
						min={windowStart}
						max={windowEnd}
						step={scrubStep}
						value={scrubValue}
						onChange={(event) => handleScrub(Number(event.currentTarget.value))}
						disabled={!isReady}
						className="accent-foreground h-2 flex-1"
						aria-label="Playhead position"
					/>
					<button
						type="button"
						disabled={!isReady}
						onClick={() => handleScrub(Math.min(safeDuration, currentTime + 1))}
						className="border-border bg-background text-foreground hover:bg-muted rounded border px-2 py-1 disabled:cursor-not-allowed disabled:opacity-50"
					>
						+1s
					</button>
					<span className="text-muted-foreground tabular-nums">
						{formatTime(scrubValue)}
					</span>
				</div>
			</div>
		</div>
	)
}
