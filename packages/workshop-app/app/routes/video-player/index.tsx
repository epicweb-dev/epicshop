import {
	PlayerPreferencesSchema,
	setPlayerPreferences,
} from '@epic-web/workshop-utils/db.server'
import RealMuxPlayer, {
	type MuxPlayerRefAttributes,
} from '@mux/mux-player-react'
import { json, type ActionFunctionArgs } from '@remix-run/node'
import { useFetcher, useRouteLoaderData } from '@remix-run/react'
import * as React from 'react'
import { z } from 'zod'
import { type loader as rootLoader } from '#app/root.tsx'
import './mux-player.css'
import { useDebounce } from '#app/utils/misc.tsx'

const PlaybackTimeSchema = z
	.object({
		time: z.number(),
		expiresAt: z.string(),
	})
	.transform(data => {
		return { time: Number(data.time), expiresAt: new Date(data.expiresAt) }
	})

export function usePlayerPreferences() {
	const data = useRouteLoaderData<typeof rootLoader>('root')
	return data?.preferences?.player ?? null
}

type MuxPlayerProps = React.ComponentProps<typeof RealMuxPlayer>

const ignoredInputs = [
	'input',
	'select',
	'button',
	'textarea',
	'mux-player',
	'summary',
]

export async function action({ request }: ActionFunctionArgs) {
	const result = PlayerPreferencesSchema.safeParse(await request.json())
	if (!result.success) {
		return json({ status: 'error', error: result.error.flatten() } as const, {
			status: 400,
		})
	}
	await setPlayerPreferences(result.data)
	return json({ status: 'success' } as const)
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
}: MuxPlayerProps & { muxPlayerRef: React.RefObject<MuxPlayerRefAttributes> }) {
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
			const isContentEditable =
				activeElement instanceof HTMLElement
					? activeElement.contentEditable === 'true'
					: false

			if (
				activeElement &&
				!ignoredInputs.includes(activeElement.tagName.toLowerCase()) &&
				!isContentEditable
			) {
				if (e.key === ' ') {
					e.preventDefault()
					void (muxPlayerRef.current.paused
						? muxPlayerRef.current.play()
						: muxPlayerRef.current.pause())
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
			}
		}
		window.document.addEventListener('keydown', handleUserKeyPress)
		return () => {
			window.document.removeEventListener('keydown', handleUserKeyPress)
		}
	}, [muxPlayerRef])

	const updatePreferences = useDebounce(() => {
		const player = muxPlayerRef.current
		if (!player) return
		const subs = Array.from(player.textTracks ?? []).find(
			t => t.kind === 'subtitles',
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

		fetcherRef.current.submit(newPrefs, {
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
					0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 3.5,
					// lol, someone really asked for this and I think it's funny so let's do it
					// https://twitter.com/zackerydev/status/1710840197879918840
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
