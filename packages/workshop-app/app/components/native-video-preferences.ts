import * as React from 'react'

type NativeVideoPlayerPreferences =
	| {
			playbackRate?: number | null
			volumeRate?: number | null
	  }
	| null
	| undefined

export function useApplyNativeVideoPreferences({
	shouldApply,
	videoElement,
	playerPreferences,
}: {
	shouldApply: boolean
	videoElement: HTMLVideoElement | null
	playerPreferences: NativeVideoPlayerPreferences
}) {
	React.useEffect(() => {
		if (!shouldApply || !videoElement) return

		if (typeof playerPreferences?.playbackRate === 'number') {
			videoElement.playbackRate = playerPreferences.playbackRate
		}

		if (typeof playerPreferences?.volumeRate === 'number') {
			videoElement.volume = playerPreferences.volumeRate
		}
	}, [
		playerPreferences?.playbackRate,
		playerPreferences?.volumeRate,
		shouldApply,
		videoElement,
	])
}
