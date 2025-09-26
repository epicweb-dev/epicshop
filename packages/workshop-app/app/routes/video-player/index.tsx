import {
	PlayerPreferencesSchema,
	setPreferences,
} from '@epic-web/workshop-utils/db.server'
import RealMuxPlayer, {
	type MuxPlayerRefAttributes,
	MinResolution,
	MaxResolution,
} from '@mux/mux-player-react'
import * as React from 'react'
import {
	data,
	type ActionFunctionArgs,
	useFetcher,
	useRouteLoaderData,
} from 'react-router'
import { z } from 'zod'
import { type RootLoaderData } from '#app/root.tsx'
import { useDebounce } from '#app/utils/misc.tsx'
import './mux-player.css'

const PlaybackTimeSchema = z
	.object({
		time: z.number(),
		expiresAt: z.string(),
	})
	.transform((data) => {
		return { time: Number(data.time), expiresAt: new Date(data.expiresAt) }
	})

export function usePlayerPreferences() {
	const data = useRouteLoaderData('root') as RootLoaderData
	return data?.preferences?.player ?? null
}

type MuxPlayerProps = React.ComponentProps<typeof RealMuxPlayer>

const ignoredInputs = ['INPUT', 'SELECT', 'BUTTON', 'TEXTAREA', 'SUMMARY']

const ignoredRoles = ['button', 'option', 'combobox', 'tab', 'tablist']

function isInMuxPlayer(el: unknown) {
	let current = el
	while (current) {
		if (!(current instanceof HTMLElement)) return false
		if (current.tagName === 'MUX-PLAYER') return true
		current = current.parentElement
	}
	return false
}

function shouldIgnoreHotkey(el: unknown) {
	let current = el
	while (current) {
		if (!(current instanceof HTMLElement)) return false

		const isIgnored =
			ignoredInputs.includes(current.tagName) ||
			ignoredRoles.includes(current.getAttribute('role') || '') ||
			current.isContentEditable
		if (isIgnored) return true
		current = current.parentElement
	}

	return false
}

export async function action({ request }: ActionFunctionArgs) {
	const result = PlayerPreferencesSchema.safeParse(await request.json())
	if (!result.success) {
		return data({ status: 'error', error: result.error.flatten() } as const, {
			status: 400,
		})
	}
	await setPreferences({ player: result.data })
	return { status: 'success' } as const
}

function useLatest<Value>(value: Value) {
	const ref = React.useRef(value)
	React.useEffect(() => {
		ref.current = value
	}, [value])
	return ref
}

export function MuxPlayer({
	muxPlayerRef,
	...props
}: MuxPlayerProps & {
	muxPlayerRef: React.RefObject<MuxPlayerRefAttributes | null>
}) {
	const playerPreferences = usePlayerPreferences()
	const playerPreferencesFetcher = useFetcher<typeof action>()
	const [metadataLoaded, setMetadataLoaded] = React.useState(false)
	const currentTimeSessionKey = `${props.playbackId}:currentTime`
	const [currentTime, setCurrentTime] = React.useState(0)

	const fetcherRef = useLatest(playerPreferencesFetcher)
	const playerPreferencesRef = useLatest(playerPreferences)

	React.useEffect(() => {
		if (typeof document === 'undefined') return
		const stored = sessionStorage.getItem(currentTimeSessionKey)
		if (!stored) return
		try {
			const { time, expiresAt } = PlaybackTimeSchema.parse(JSON.parse(stored))
			if (expiresAt.getTime() < Date.now()) throw new Error('Time expired')
			setCurrentTime(time)
		} catch {
			sessionStorage.removeItem(currentTimeSessionKey)
		}
	}, [currentTimeSessionKey])

	React.useEffect(() => {
		function handleUserKeyPress(e: KeyboardEvent) {
			if (!muxPlayerRef.current) return
			const activeElement = document.activeElement

			if (shouldIgnoreHotkey(activeElement)) return
			if (shouldIgnoreHotkey(e.target)) return

			if (!isInMuxPlayer(activeElement)) {
				// these are hotkeys the video player handles for us when focus is on the video player
				// but we want them to apply globally
				if (e.key === ' ') {
					e.preventDefault()
					if (muxPlayerRef.current.paused) {
						// Only attempt to play if metadata is loaded to avoid AbortError
						if (metadataLoaded) {
							void muxPlayerRef.current.play().catch(() => {})
						}
					} else {
						muxPlayerRef.current.pause()
					}
				}
				if (e.key === 'ArrowRight') {
					e.preventDefault()
					muxPlayerRef.current.currentTime =
						muxPlayerRef.current.currentTime +
						(muxPlayerRef.current.forwardSeekOffset || 10)
				}
				if (e.key === 'ArrowLeft') {
					e.preventDefault()
					muxPlayerRef.current.currentTime =
						muxPlayerRef.current.currentTime -
						(muxPlayerRef.current.forwardSeekOffset || 10)
				}
				if (e.key === 'f' && !e.metaKey && !e.ctrlKey) {
					e.preventDefault()
					void (document.fullscreenElement
						? document.exitFullscreen()
						: muxPlayerRef.current.requestFullscreen())
				}
				// k to play/pause
				if (e.key === 'k') {
					e.preventDefault()
					if (muxPlayerRef.current.paused) {
						// Only attempt to play if metadata is loaded to avoid AbortError
						if (metadataLoaded) {
							void muxPlayerRef.current.play().catch(() => {})
						}
					} else {
						muxPlayerRef.current.pause()
					}
				}
				// c to toggle captions
				if (e.key === 'c') {
					e.preventDefault()
					const textTracks = Array.from(muxPlayerRef.current.textTracks ?? [])
					const subtitleTrack = textTracks.find((track) => track.kind === 'subtitles')
					if (subtitleTrack) {
						subtitleTrack.mode = subtitleTrack.mode === 'showing' ? 'disabled' : 'showing'
					}
				}
			}

			// these are hot keys the video player does not handle for us

			// j to go backward
			if (e.key === 'j') {
				e.preventDefault()
				muxPlayerRef.current.currentTime = Math.max(
					0, 
					muxPlayerRef.current.currentTime - (muxPlayerRef.current.forwardSeekOffset || 10)
				)
			}
			// l to go forward
			if (e.key === 'l') {
				e.preventDefault()
				muxPlayerRef.current.currentTime = Math.min(
					muxPlayerRef.current.duration || Infinity,
					muxPlayerRef.current.currentTime + (muxPlayerRef.current.forwardSeekOffset || 10)
				)
			}
			// , (when paused) to go to the previous frame
			if (e.key === ',' && muxPlayerRef.current.paused) {
				e.preventDefault()
				// Step backward by approximately 1/30 second (one frame at 30fps)
				muxPlayerRef.current.currentTime = Math.max(
					0,
					muxPlayerRef.current.currentTime - (1 / 30)
				)
			}
			// . (when paused) to go to the next frame
			if (e.key === '.' && muxPlayerRef.current.paused && !e.shiftKey) {
				e.preventDefault()
				// Step forward by approximately 1/30 second (one frame at 30fps)
				muxPlayerRef.current.currentTime = Math.min(
					muxPlayerRef.current.duration || Infinity,
					muxPlayerRef.current.currentTime + (1 / 30)
				)
			}
			// Seek to specific point in the video (7 advances to 70% of duration) 0..9
			if (/^[0-9]$/.test(e.key)) {
				e.preventDefault()
				const percentage = parseInt(e.key) / 10
				const duration = muxPlayerRef.current.duration
				if (duration) {
					muxPlayerRef.current.currentTime = duration * percentage
				}
			}
			// i toggle picture in picture
			if (e.key === 'i') {
				e.preventDefault()
				if (document.pictureInPictureElement) {
					void document.exitPictureInPicture().catch(() => {})
				} else {
					void muxPlayerRef.current.requestPictureInPicture().catch(() => {})
				}
			}
			// arrow up/down to adjust volume
			if (e.key === 'ArrowUp') {
				e.preventDefault()
				muxPlayerRef.current.volume = Math.min(1, muxPlayerRef.current.volume + 0.1)
			}
			if (e.key === 'ArrowDown') {
				e.preventDefault()
				muxPlayerRef.current.volume = Math.max(0, muxPlayerRef.current.volume - 0.1)
			}

			// Speed control shortcuts: Shift+> (increase) and Shift+< (decrease)
			if (e.shiftKey && (e.key === '>' || e.key === '.')) {
				e.preventDefault()
				const currentRate = muxPlayerRef.current.playbackRate || 1
				const newRate = Math.min(currentRate + 0.25, 4) // Cap at 4x speed
				muxPlayerRef.current.playbackRate = newRate
			}
			if (e.shiftKey && (e.key === '<' || e.key === ',')) {
				e.preventDefault()
				const currentRate = muxPlayerRef.current.playbackRate || 1
				const newRate = Math.max(currentRate - 0.25, 0.25) // Min at 0.25x speed
				muxPlayerRef.current.playbackRate = newRate
			}
		}
		window.document.addEventListener('keydown', handleUserKeyPress)
		return () => {
			window.document.removeEventListener('keydown', handleUserKeyPress)
		}
	}, [muxPlayerRef, metadataLoaded])

	const updatePreferences = useDebounce(() => {
		const player = muxPlayerRef.current
		if (!player) return
		const subs = Array.from(player.textTracks ?? []).find(
			(t) => t.kind === 'subtitles',
		)
		const newPrefs = {
			playbackRate: player.playbackRate,
			volumeRate: player.volume,
			subtitle: subs
				? { id: subs.id, mode: subs.mode }
				: { id: null, mode: 'disabled' },
		} satisfies z.input<typeof PlayerPreferencesSchema>

		// don't update the preferences if there's no change...
		if (isDeepEqual(newPrefs, playerPreferencesRef.current)) return

		void fetcherRef.current.submit(newPrefs, {
			method: 'POST',
			action: '/video-player',
			encType: 'application/json',
		})
	}, 300)

	React.useEffect(() => {
		// as the video player gets loaded, mux fires a bunch of change events which
		// we don't want. So we wait until the metadata is loaded before we start
		// listening to the events.
		if (!metadataLoaded) return

		const textTracks = muxPlayerRef.current?.textTracks
		if (!textTracks) return

		const subtitlePref = playerPreferencesRef.current?.subtitle
		if (subtitlePref?.id) {
			const preferredTextTrack = textTracks.getTrackById(subtitlePref.id)
			if (preferredTextTrack) {
				preferredTextTrack.mode = subtitlePref.mode ?? 'hidden'
			}
		}

		textTracks.addEventListener('change', updatePreferences)
		return () => {
			textTracks.removeEventListener('change', updatePreferences)
		}
	}, [metadataLoaded, muxPlayerRef, playerPreferencesRef, updatePreferences])

	return (
		<div className="flex aspect-video flex-col">
			<RealMuxPlayer
				ref={muxPlayerRef}
				playbackRates={[
					0.5, 0.75, 0.8, 0.9, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 3.5,
					// lol, someone really asked for this and I think it's funny so let's do it
					// https://x.com/zackerydev/status/1710840197879918840
					4,
				]}
				volume={playerPreferences?.volumeRate ?? 1}
				playbackRate={playerPreferences?.playbackRate ?? 1}
				thumbnailTime={currentTime}
				onRateChange={updatePreferences}
				onVolumeChange={updatePreferences}
				streamType="on-demand"
				defaultHiddenCaptions={true}
				currentTime={currentTime}
				onTimeUpdate={() =>
					sessionStorage.setItem(
						currentTimeSessionKey,
						JSON.stringify({
							time: muxPlayerRef.current?.currentTime,
							expiresAt: new Date(Date.now() + 1000 * 60 * 30).toISOString(),
						}),
					)
				}
				accentColor="#427cf0"
				targetLiveWindow={NaN} // this has gotta be a bug. Without this prop, we get SSR warnings 🤷‍♂️
				onLoadedMetadata={() => setMetadataLoaded(true)}
				minResolution={getMinResolutionValue(playerPreferences?.minResolution)}
				maxResolution={getMaxResolutionValue(playerPreferences?.maxResolution)}
				{...props}
			/>
		</div>
	)
}

function isDeepEqual(obj1: unknown, obj2: unknown) {
	if (obj1 === obj2) return true
	if (typeof obj1 !== typeof obj2) return false
	if (typeof obj1 !== 'object' || typeof obj2 !== 'object') return false
	if (obj1 === null || obj2 === null) return false
	if (Array.isArray(obj1) !== Array.isArray(obj2)) return false
	if (Array.isArray(obj1) && Array.isArray(obj2)) {
		if (obj1.length !== obj2.length) return false
		for (let i = 0; i < obj1.length; i++) {
			if (!isDeepEqual(obj1[i], obj2[i])) return false
		}
		return true
	}
	const keys1 = Object.keys(obj1)
	const keys2 = Object.keys(obj2)
	if (keys1.length !== keys2.length) return false
	for (const key of keys1) {
		// @ts-expect-error 🤷‍♂️ it's fine
		if (!isDeepEqual(obj1[key], obj2[key])) return false
	}
	return true
}

function getMinResolutionValue(resolution: number | undefined) {
	if (!resolution) return undefined
	if (resolution <= 480) return MinResolution.noLessThan480p
	if (resolution <= 540) return MinResolution.noLessThan540p
	if (resolution <= 720) return MinResolution.noLessThan720p
	if (resolution <= 1080) return MinResolution.noLessThan1080p
	if (resolution <= 1440) return MinResolution.noLessThan1440p
	return MinResolution.noLessThan2160p
}

function getMaxResolutionValue(resolution: number | undefined) {
	if (!resolution) return undefined
	if (resolution <= 720) return MaxResolution.upTo720p
	if (resolution <= 1080) return MaxResolution.upTo1080p
	if (resolution <= 1440) return MaxResolution.upTo1440p
	return MaxResolution.upTo2160p
}
