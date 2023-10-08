import MuxPlayerDefault, {
	type MuxPlayerRefAttributes,
} from '@mux/mux-player-react'
import { json, type DataFunctionArgs } from '@remix-run/node'
import { useFetcher, useRouteLoaderData } from '@remix-run/react'
import * as React from 'react'
import { type z } from 'zod'
import { type loader as rootLoader } from '#app/root.tsx'
import {
	PlayerPreferencesSchema,
	setPlayerPreferences,
} from '#app/utils/db.server.ts'
import './mux-player.css'

export function usePlayerPreferences() {
	const data = useRouteLoaderData<typeof rootLoader>('root')
	return data?.preferences?.player ?? null
}

// Pretty sure their types are wrong in an ESM environment... 🤷‍♂️
const RealMuxPlayer =
	MuxPlayerDefault as unknown as typeof MuxPlayerDefault.default
type MuxPlayerProps = React.ComponentProps<typeof RealMuxPlayer>

const ignoredInputs = ['input', 'select', 'button', 'textarea', 'mux-player']

export async function action({ request }: DataFunctionArgs) {
	const result = PlayerPreferencesSchema.safeParse(await request.json())
	if (!result.success) {
		return json({ status: 'error', error: result.error.flatten() } as const, {
			status: 400,
		})
	}
	await setPlayerPreferences(result.data)
	return json({ status: 'success' } as const)
}

export function MuxPlayer(props: MuxPlayerProps) {
	const playerPreferences = usePlayerPreferences()
	const playerPreferencesFetcher = useFetcher<typeof action>()

	const muxPlayerRef = React.useRef<MuxPlayerRefAttributes>(null)

	React.useEffect(() => {
		function handleUserKeyPress(e: any) {
			if (!muxPlayerRef.current) return
			const activeElement = document.activeElement
			const isContentEditable =
				activeElement instanceof HTMLElement
					? activeElement.contentEditable === 'true'
					: false

			if (
				activeElement &&
				ignoredInputs.indexOf(activeElement.tagName.toLowerCase()) === -1 &&
				!isContentEditable
			) {
				if (e.key === ' ') {
					e.preventDefault()
					muxPlayerRef.current.paused
						? muxPlayerRef.current.play()
						: muxPlayerRef.current.pause()
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
					document.fullscreenElement
						? document.exitFullscreen()
						: muxPlayerRef.current.requestFullscreen()
				}
			}
		}
		window.document?.addEventListener('keydown', handleUserKeyPress)
		return () => {
			window.document?.removeEventListener('keydown', handleUserKeyPress)
		}
	}, [])

	function updatePreferences() {
		const player = muxPlayerRef.current
		if (!player) return
		playerPreferencesFetcher.submit(
			// TODO: figure out how to actually read the proper values for this submission
			{
				playbackRate: player.playbackRate ?? undefined,
				volumeRate: player.volume ?? undefined,
				subtitle: {
					id: null,
					kind: null,
					label: null,
					language: null,
					mode: 'disabled',
				},
				videoQuality: {},
				// TODO: figure out how to make this satisfy a value that would be
				// parseable by PlayerPreferencesSchema rather than one that satisfies
				// the post-parse type
			} satisfies z.infer<typeof PlayerPreferencesSchema>,
			{ method: 'POST', action: '/video-player', encType: 'application/json' },
		)
	}

	return (
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
			thumbnailTime={0}
			onRateChange={updatePreferences}
			onVolumeChange={updatePreferences}
			{...props}
		/>
	)
}
