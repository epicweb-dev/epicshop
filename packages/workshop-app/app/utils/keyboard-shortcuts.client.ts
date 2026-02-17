import { type MuxPlayerRefAttributes } from '@mux/mux-player-react'
import { clickKeyboardAction } from '#app/utils/keyboard-action.ts'

let gNavigationState: {
	exerciseNumber: string | null
	waitingForDot: boolean
	navigationTimeout: ReturnType<typeof setTimeout> | null
} = {
	exerciseNumber: null,
	waitingForDot: false,
	navigationTimeout: null,
}

const G_KEY_TIMEOUT = 1000
const NAVIGATION_DELAY = 300

type KeySequenceController = {
	start: () => void
	clear: () => void
	scheduleClear: () => void
	isActive: () => boolean
	handleInvalid: (event: KeyboardEvent) => boolean
}

function createKeySequence({
	timeoutMs,
	onClear,
}: {
	timeoutMs: number
	onClear?: () => void
}): KeySequenceController {
	let clearTimeoutId: ReturnType<typeof setTimeout> | null = null
	let active = false

	function clear() {
		if (clearTimeoutId) {
			clearTimeout(clearTimeoutId)
		}
		clearTimeoutId = null
		active = false
		onClear?.()
	}

	function scheduleClear() {
		if (clearTimeoutId) {
			clearTimeout(clearTimeoutId)
		}
		clearTimeoutId = setTimeout(clear, timeoutMs)
	}

	function start() {
		active = true
		scheduleClear()
	}

	function handleInvalid(event: KeyboardEvent) {
		event.preventDefault()
		clear()
		return true
	}

	return {
		start,
		clear,
		scheduleClear,
		isActive: () => active,
		handleInvalid,
	}
}

function resetGNavigationState() {
	if (gNavigationState.navigationTimeout) {
		clearTimeout(gNavigationState.navigationTimeout)
	}
	gNavigationState = {
		exerciseNumber: null,
		waitingForDot: false,
		navigationTimeout: null,
	}
}

const gSequence = createKeySequence({
	timeoutMs: G_KEY_TIMEOUT,
	onClear: resetGNavigationState,
})
const spSequenceState = { waitingForSecondP: false }
const spSequence = createKeySequence({
	timeoutMs: G_KEY_TIMEOUT,
	onClear: () => {
		if (spSequenceState.waitingForSecondP) {
			spSequenceState.waitingForSecondP = false
			clickKeyboardAction('s+p')
		}
	},
})

function navigateTo(path: string) {
	window.location.href = path
}

function handleGNavigation(e: KeyboardEvent): boolean {
	if (e.key === 'g' && !e.metaKey && !e.ctrlKey) {
		spSequence.clear()
		gSequence.clear()
		gSequence.start()
		return false
	}

	if (gSequence.isActive()) {
		if (e.key === 'h') {
			e.preventDefault()
			gSequence.clear()
			navigateTo('/')
			return true
		}

		if (e.key === 'a') {
			e.preventDefault()
			gSequence.clear()
			navigateTo('/account')
			return true
		}

		if (e.key === 'n') {
			e.preventDefault()
			if (clickKeyboardAction('g+n')) {
				gSequence.clear()
				return true
			}
			gSequence.clear()
			return false
		}

		if (e.key === 'p') {
			e.preventDefault()
			if (clickKeyboardAction('g+p')) {
				gSequence.clear()
				return true
			}
			gSequence.clear()
			return false
		}

		if (e.key === 'o') {
			e.preventDefault()
			if (clickKeyboardAction('g+o')) {
				gSequence.clear()
				return true
			}
			gSequence.clear()
			return false
		}

		if (e.key === 'd') {
			e.preventDefault()
			gSequence.clear()
			navigateTo('/admin')
			return true
		}

		if (e.key === 'l') {
			e.preventDefault()
			gSequence.clear()
			navigateTo('/l')
			return true
		}

		if (/^[1-9]$/.test(e.key) && !gNavigationState.exerciseNumber) {
			e.preventDefault()
			gNavigationState.exerciseNumber = e.key
			gNavigationState.waitingForDot = false
			gSequence.scheduleClear()
			gNavigationState.navigationTimeout = setTimeout(() => {
				if (
					gNavigationState.exerciseNumber &&
					!gNavigationState.waitingForDot
				) {
					const exerciseNumber = gNavigationState.exerciseNumber.padStart(
						2,
						'0',
					)
					gSequence.clear()
					navigateTo(`/exercise/${exerciseNumber}`)
				}
			}, NAVIGATION_DELAY)
			return true
		}

		if (gNavigationState.exerciseNumber) {
			if (e.key === '.' && !gNavigationState.waitingForDot) {
				e.preventDefault()
				if (gNavigationState.navigationTimeout) {
					clearTimeout(gNavigationState.navigationTimeout)
					gNavigationState.navigationTimeout = null
				}
				gNavigationState.waitingForDot = true
				gSequence.scheduleClear()
				return true
			}

			if (e.key === 'f' && gNavigationState.waitingForDot) {
				e.preventDefault()
				const exerciseNumber = gNavigationState.exerciseNumber.padStart(2, '0')
				gSequence.clear()
				navigateTo(`/exercise/${exerciseNumber}/finished`)
				return true
			}

			if (/^[1-9]$/.test(e.key) && gNavigationState.waitingForDot) {
				e.preventDefault()
				const exerciseNumber = gNavigationState.exerciseNumber.padStart(2, '0')
				const stepNumber = e.key.padStart(2, '0')
				gSequence.clear()
				navigateTo(`/exercise/${exerciseNumber}/${stepNumber}/problem`)
				return true
			}
		}

		return gSequence.handleInvalid(e)
	}

	return false
}

function handleSetPlaygroundShortcut(e: KeyboardEvent): boolean {
	if (e.key === 's' && !e.metaKey && !e.ctrlKey) {
		spSequence.clear()
		spSequence.start()
		return false
	}

	if (spSequence.isActive()) {
		if (e.key === 'p') {
			e.preventDefault()
			if (spSequenceState.waitingForSecondP) {
				const didClick = clickKeyboardAction('s+p+p')
				spSequenceState.waitingForSecondP = false
				spSequence.clear()
				return didClick
			}
			// Check if s+p+p element exists - if so, wait for potential second p
			const hasSppElement = document.querySelector(
				'[data-keyboard-action="s+p+p"]',
			)
			if (hasSppElement) {
				spSequenceState.waitingForSecondP = true
				spSequence.scheduleClear()
				return false
			}
			const didClick = clickKeyboardAction('s+p')
			if (didClick) {
				spSequence.clear()
				return true
			}
			spSequence.clear()
			return false
		}

		return spSequence.handleInvalid(e)
	}

	return false
}

function getParentMuxPlayer(el: unknown) {
	return el instanceof HTMLElement ? el.closest('mux-player') : null
}

function getParentMediaController(el: unknown) {
	return el instanceof HTMLElement ? el.closest('media-controller') : null
}

type MediaControllerElement = HTMLElement & {
	media?: HTMLMediaElement | null
}

function getMediaElementFromController(
	controller: MediaControllerElement | null,
) {
	if (!controller) return null
	if (controller.media instanceof HTMLMediaElement) {
		return controller.media
	}
	const mediaElement = controller.querySelector('video, audio')
	return mediaElement instanceof HTMLMediaElement ? mediaElement : null
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

const defaultPlaybackRates = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4]

function handleKeyDown(e: KeyboardEvent) {
	// don't apply hotkeys below when meta or ctrl is pressed
	if (e.metaKey || e.ctrlKey) return

	const activeElement = document.activeElement
	if (shouldIgnoreHotkey(activeElement)) return
	if (shouldIgnoreHotkey(e.target)) return

	// Handle '?' to open keyboard shortcuts dialog
	if (e.key === '?') {
		e.preventDefault()
		window.dispatchEvent(new CustomEvent('toggle-keyboard-shortcuts'))
		return
	}

	// Handle 'g' navigation shortcuts
	if (handleGNavigation(e)) {
		return
	}

	// Handle 's' + 'p' to set playground to current exercise
	if (handleSetPlaygroundShortcut(e)) {
		return
	}

	// if there are multiple players then we control the one that has focus
	// and if neither has focus, we control the first one
	const parentMuxPlayer = getParentMuxPlayer(activeElement)
	const parentMediaController = getParentMediaController(activeElement)
	const focusIsInPlayer = Boolean(parentMuxPlayer ?? parentMediaController)
	const firstPlayer =
		document.querySelector('mux-player, media-controller') ?? null
	const playerElement = parentMuxPlayer ?? parentMediaController ?? firstPlayer
	if (!playerElement) return

	if (isMuxPlayer(playerElement)) {
		const muxPlayer = playerElement

		if (!focusIsInPlayer) {
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
			} else if (
				muxPlayer.media &&
				'requestPictureInPicture' in muxPlayer.media
			) {
				void (muxPlayer.media as HTMLVideoElement).requestPictureInPicture()
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

		return
	}

	const mediaController = playerElement as MediaControllerElement
	const mediaElement = getMediaElementFromController(mediaController)
	if (!mediaElement) return

	if (!focusIsInPlayer) {
		// these are hotkeys the video player handles for us when focus is on the video player
		// but we want them to apply globally
		if (e.key === ' ') {
			e.preventDefault()
			if (mediaElement.paused) {
				if (mediaElement.readyState >= 1) {
					void mediaElement.play().catch(() => {})
				}
			} else {
				mediaElement.pause()
			}
		}
		if (e.key === 'ArrowRight') {
			e.preventDefault()
			mediaElement.currentTime = mediaElement.currentTime + 10
		}
		if (e.key === 'ArrowLeft') {
			e.preventDefault()
			mediaElement.currentTime = mediaElement.currentTime - 10
		}
		if (e.key === 'f') {
			e.preventDefault()
			void (document.fullscreenElement
				? document.exitFullscreen()
				: mediaController.requestFullscreen())
		}
		// k to play/pause
		if (e.key === 'k') {
			e.preventDefault()
			if (mediaElement.paused) {
				if (mediaElement.readyState >= 1) {
					void mediaElement.play().catch(() => {})
				}
			} else {
				mediaElement.pause()
			}
		}
		// c to toggle captions
		if (e.key === 'c') {
			e.preventDefault()
			const textTracks = Array.from(mediaElement.textTracks ?? [])
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
		mediaElement.currentTime = Math.max(0, mediaElement.currentTime - 10)
	}
	// l to go forward
	if (e.key === 'l') {
		e.preventDefault()
		mediaElement.currentTime = Math.min(
			mediaElement.duration || Infinity,
			mediaElement.currentTime + 10,
		)
	}
	// , (when paused) to go to the previous frame
	if (e.key === ',' && mediaElement.paused) {
		e.preventDefault()
		// Step backward by approximately 1/30 second (one frame at 30fps)
		mediaElement.currentTime = Math.max(0, mediaElement.currentTime - 1 / 30)
	}
	// . (when paused) to go to the next frame
	if (e.key === '.' && mediaElement.paused && !e.shiftKey) {
		e.preventDefault()
		// Step forward by approximately 1/30 second (one frame at 30fps)
		mediaElement.currentTime = Math.min(
			mediaElement.duration || Infinity,
			mediaElement.currentTime + 1 / 30,
		)
	}
	// Seek to specific point in the video (7 advances to 70% of duration) 0..9
	if (/^[0-9]$/.test(e.key)) {
		e.preventDefault()
		const percentage = parseInt(e.key) / 10
		const duration = mediaElement.duration
		if (duration) {
			mediaElement.currentTime = duration * percentage
		}
	}
	// i toggle picture in picture
	if (e.key === 'i') {
		e.preventDefault()
		if (document.pictureInPictureElement) {
			void document.exitPictureInPicture().catch(() => {})
		} else if ('requestPictureInPicture' in mediaElement) {
			void (mediaElement as HTMLVideoElement).requestPictureInPicture()
		}
	}
	// arrow up/down to adjust volume
	if (e.key === 'ArrowUp') {
		e.preventDefault()
		mediaElement.volume = Math.min(1, mediaElement.volume + 0.1)
	}
	if (e.key === 'ArrowDown') {
		e.preventDefault()
		mediaElement.volume = Math.max(0, mediaElement.volume - 0.1)
	}

	// Speed control shortcuts: Shift+> (increase) and Shift+< (decrease)
	if (e.shiftKey && e.key === '>') {
		e.preventDefault()
		const currentRate = mediaElement.playbackRate
		const rates = defaultPlaybackRates
		const nextRate = rates
			.filter((rate) => rate > currentRate)
			.sort((a, b) => a - b)[0]
		if (nextRate && nextRate !== currentRate) {
			mediaElement.playbackRate = nextRate
		}
	}
	if (e.shiftKey && e.key === '<') {
		e.preventDefault()
		const currentRate = mediaElement.playbackRate
		const rates = defaultPlaybackRates
		const previousRate = rates
			.filter((rate) => rate < currentRate)
			.sort((a, b) => b - a)[0]
		if (previousRate && previousRate !== currentRate) {
			mediaElement.playbackRate = previousRate
		}
	}
}

export function init() {
	window.document.addEventListener('keydown', handleKeyDown)
}
