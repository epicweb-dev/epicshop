import MuxPlayerDefault, {
	type MuxPlayerRefAttributes,
} from '@mux/mux-player-react'
import * as React from 'react'

// Pretty sure their types are wrong in an ESM environment... 🤷‍♂️
const RealMuxPlayer =
	MuxPlayerDefault as unknown as typeof MuxPlayerDefault.default
type MuxPlayerProps = React.ComponentProps<typeof RealMuxPlayer>

const ignoredInputs = ['input', 'select', 'button', 'textarea', 'mux-player']

export function MuxPlayer(props: MuxPlayerProps) {
	const muxPlayerRef = React.useRef<MuxPlayerRefAttributes>(null)
	const handleUserKeyPress = React.useCallback(
		(e: any) => {
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
				if (muxPlayerRef.current) {
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
		},
		[muxPlayerRef],
	)

	React.useEffect(() => {
		window.document?.addEventListener('keydown', handleUserKeyPress)
		return () => {
			window.document?.removeEventListener('keydown', handleUserKeyPress)
		}
	}, [handleUserKeyPress])

	return <RealMuxPlayer ref={muxPlayerRef} {...props} />
}
