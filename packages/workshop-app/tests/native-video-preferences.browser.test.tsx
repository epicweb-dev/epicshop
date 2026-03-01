import * as React from 'react'
import { expect, test } from 'vitest'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { useApplyNativeVideoPreferences } from '#app/components/native-video-preferences.ts'

function LegacyHydrationDelayedVideoPreferences() {
	const playbackRate = 1.75
	const volumeRate = 0.25
	const shouldUseOfflineVideo = true
	const nativeVideoRef = React.useRef<HTMLVideoElement>(null)
	const [isHydrated, setIsHydrated] = React.useState(false)
	const [snapshot, setSnapshot] = React.useState('legacy:pending')

	React.useEffect(() => {
		setIsHydrated(true)
	}, [])

	React.useEffect(() => {
		if (!nativeVideoRef.current) return
		if (typeof playbackRate === 'number') {
			nativeVideoRef.current.playbackRate = playbackRate
		}
		if (typeof volumeRate === 'number') {
			nativeVideoRef.current.volume = volumeRate
		}
	}, [playbackRate, volumeRate, shouldUseOfflineVideo])

	React.useEffect(() => {
		if (!isHydrated || !nativeVideoRef.current) return
		setSnapshot(
			`legacy:${nativeVideoRef.current.playbackRate.toFixed(2)}|${nativeVideoRef.current.volume.toFixed(2)}`,
		)
	}, [isHydrated])

	return (
		<div>
			{isHydrated ? (
				<video ref={nativeVideoRef} aria-label="legacy-video" />
			) : (
				<span>legacy-fallback</span>
			)}
			<span>{snapshot}</span>
		</div>
	)
}

function FixedHydrationDelayedVideoPreferences() {
	const playerPreferences = { playbackRate: 1.75, volumeRate: 0.25 }
	const shouldUseOfflineVideo = true
	const nativeVideoRef = React.useRef<HTMLVideoElement>(null)
	const [nativeVideoElement, setNativeVideoElement] =
		React.useState<HTMLVideoElement | null>(null)
	const [isHydrated, setIsHydrated] = React.useState(false)
	const [snapshot, setSnapshot] = React.useState('fixed:pending')
	const setNativeVideoRef = React.useCallback(
		(element: HTMLVideoElement | null) => {
			nativeVideoRef.current = element
			setNativeVideoElement(element)
		},
		[],
	)

	useApplyNativeVideoPreferences({
		shouldApply: shouldUseOfflineVideo,
		videoElement: nativeVideoElement,
		playerPreferences,
	})

	React.useEffect(() => {
		setIsHydrated(true)
	}, [])

	React.useEffect(() => {
		if (!nativeVideoElement || !nativeVideoRef.current) return
		setSnapshot(
			`fixed:${nativeVideoRef.current.playbackRate.toFixed(2)}|${nativeVideoRef.current.volume.toFixed(2)}`,
		)
	}, [nativeVideoElement])

	return (
		<div>
			{isHydrated ? (
				<video ref={setNativeVideoRef} aria-label="fixed-video" />
			) : (
				<span>fixed-fallback</span>
			)}
			<span>{snapshot}</span>
		</div>
	)
}

test('legacy ref-only effect misses preferences after hydration (aha)', async () => {
	await render(<LegacyHydrationDelayedVideoPreferences />)

	await expect.element(page.getByText('legacy:1.00|1.00')).toBeVisible()
})

test('applies preferences when delayed video element mounts', async () => {
	await render(<FixedHydrationDelayedVideoPreferences />)

	await expect.element(page.getByText('fixed:1.75|0.25')).toBeVisible()
})
