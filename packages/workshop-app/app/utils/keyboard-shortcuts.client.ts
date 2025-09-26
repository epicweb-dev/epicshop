import { type MuxPlayerRefAttributes } from '@mux/mux-player-react'

function getParentMuxPlayer(el: unknown) {
	return el instanceof HTMLElement ? el.closest('mux-player') : null
}

function shouldIgnoreHotkey(el: unknown) {
	if (!(el instanceof HTMLElement)) return false

	const closestInteractive = el.closest(
		'input,select,button,textarea,summary,' +
			'[role="button"],[role="option"],[role="combobox"],[role="tab"],[role="tablist"],' +
			'[contenteditable=""],[contenteditable="true"]',
	)
	return Boolean(closestInteractive)
}

function isMuxPlayer(el: unknown): el is MuxPlayerRefAttributes {
	return typeof el === 'object' && el !== null && 'mux' in el
}

function handleUserKeyPressForMuxPlayer(e: KeyboardEvent) {
	// don't apply hotkeys when meta or ctrl is pressed
	if (e.metaKey || e.ctrlKey) return

	const activeElement = document.activeElement
	if (shouldIgnoreHotkey(activeElement)) return
	if (shouldIgnoreHotkey(e.target)) return

	// if there are multiple players then we control the one that has focus
	// and if neither has focus, we control the first one
	const parentMuxPlayer = getParentMuxPlayer(activeElement)
	const focusIsInMuxPlayer = Boolean(parentMuxPlayer)
	const firstMuxPlayer = document.querySelectorAll('mux-player')[0] ?? null
	const muxPlayer = parentMuxPlayer ?? firstMuxPlayer
	if (!isMuxPlayer(muxPlayer)) return

	if (!focusIsInMuxPlayer) {
		// these are hotkeys the video player handles for us when focus is on the video player
		// but we want them to apply globally
		if (e.key === ' ') {
			e.preventDefault()
			if (muxPlayer.paused) {
				// Only attempt to play if metadata is loaded to avoid AbortError
				if (muxPlayer.metadata) {
					void muxPlayer.play().catch(() => {})
				}
			} else {
				muxPlayer.pause()
			}
		}
		if (e.key === 'ArrowRight') {
			e.preventDefault()
			muxPlayer.currentTime =
				muxPlayer.currentTime + (muxPlayer.forwardSeekOffset || 10)
		}
		if (e.key === 'ArrowLeft') {
			e.preventDefault()
			muxPlayer.currentTime =
				muxPlayer.currentTime - (muxPlayer.forwardSeekOffset || 10)
		}
		if (e.key === 'f') {
			e.preventDefault()
			void (document.fullscreenElement
				? document.exitFullscreen()
				: muxPlayer.requestFullscreen())
		}
		// k to play/pause
		if (e.key === 'k') {
			e.preventDefault()
			if (muxPlayer.paused) {
				// Only attempt to play if metadata is loaded to avoid AbortError
				if (muxPlayer.metadata) {
					void muxPlayer.play().catch(() => {})
				}
			} else {
				muxPlayer.pause()
			}
		}
		// c to toggle captions
		if (e.key === 'c') {
			e.preventDefault()
			const textTracks = Array.from(muxPlayer.textTracks ?? [])
			const subtitleTrack = textTracks.find(
				(track) => track.kind === 'subtitles',
			)
			if (subtitleTrack) {
				subtitleTrack.mode =
					subtitleTrack.mode === 'showing' ? 'disabled' : 'showing'
			}
		}
	}

	// these are hot keys the video player does not handle for us

	// j to go backward
	if (e.key === 'j') {
		e.preventDefault()
		muxPlayer.currentTime = Math.max(
			0,
			muxPlayer.currentTime - (muxPlayer.forwardSeekOffset || 10),
		)
	}
	// l to go forward
	if (e.key === 'l') {
		e.preventDefault()
		muxPlayer.currentTime = Math.min(
			muxPlayer.duration || Infinity,
			muxPlayer.currentTime + (muxPlayer.forwardSeekOffset || 10),
		)
	}
	// , (when paused) to go to the previous frame
	if (e.key === ',' && muxPlayer.paused) {
		e.preventDefault()
		// Step backward by approximately 1/30 second (one frame at 30fps)
		muxPlayer.currentTime = Math.max(0, muxPlayer.currentTime - 1 / 30)
	}
	// . (when paused) to go to the next frame
	if (e.key === '.' && muxPlayer.paused && !e.shiftKey) {
		e.preventDefault()
		// Step forward by approximately 1/30 second (one frame at 30fps)
		muxPlayer.currentTime = Math.min(
			muxPlayer.duration || Infinity,
			muxPlayer.currentTime + 1 / 30,
		)
	}
	// Seek to specific point in the video (7 advances to 70% of duration) 0..9
	if (/^[0-9]$/.test(e.key)) {
		e.preventDefault()
		const percentage = parseInt(e.key) / 10
		const duration = muxPlayer.duration
		if (duration) {
			muxPlayer.currentTime = duration * percentage
		}
	}
	// i toggle picture in picture
	if (e.key === 'i') {
		e.preventDefault()
		if (document.pictureInPictureElement) {
			void document.exitPictureInPicture().catch(() => {})
		} else {
			void muxPlayer?.media?.requestPictureInPicture()
		}
	}
	// arrow up/down to adjust volume
	if (e.key === 'ArrowUp') {
		e.preventDefault()
		muxPlayer.volume = Math.min(1, muxPlayer.volume + 0.1)
	}
	if (e.key === 'ArrowDown') {
		e.preventDefault()
		muxPlayer.volume = Math.max(0, muxPlayer.volume - 0.1)
	}

	// Speed control shortcuts: Shift+> (increase) and Shift+< (decrease)
	if (e.shiftKey && e.key === '>') {
		e.preventDefault()
		const currentRate = muxPlayer.playbackRate
		const rates = muxPlayer.playbackRates ?? []
		const nextRate = rates
			.filter((rate) => rate > currentRate)
			.sort((a, b) => a - b)[0]
		if (nextRate && nextRate !== currentRate) {
			muxPlayer.playbackRate = nextRate
		}
	}
	if (e.shiftKey && e.key === '<') {
		e.preventDefault()
		const currentRate = muxPlayer.playbackRate
		const rates = muxPlayer.playbackRates ?? []
		const previousRate = rates
			.filter((rate) => rate < currentRate)
			.sort((a, b) => b - a)[0]
		if (previousRate && previousRate !== currentRate) {
			muxPlayer.playbackRate = previousRate
		}
	}
}

export function init() {
	window.document.addEventListener('keydown', handleUserKeyPressForMuxPlayer)
}
