import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { SceneShell } from './scene-shell.tsx'

type HookSceneProps = {
	title: string
	tagline: string
}

export function HookScene({ title, tagline }: HookSceneProps) {
	const frame = useCurrentFrame()
	const { fps } = useVideoConfig()

	const titleScale = spring({
		fps,
		frame,
		config: { damping: 180, mass: 0.8 },
	})
	const titleOpacity = interpolate(frame, [0, fps], [0, 1], {
		extrapolateRight: 'clamp',
	})
	const taglineOpacity = interpolate(frame, [0.6 * fps, 1.6 * fps], [0, 1], {
		extrapolateRight: 'clamp',
	})
	const taglineY = interpolate(frame, [0.6 * fps, 1.6 * fps], [24, 0], {
		extrapolateRight: 'clamp',
	})

	return (
		<SceneShell dim={0.5}>
			<div style={{ maxWidth: 1200 }}>
				<div
					style={{
						fontSize: 84,
						fontWeight: 700,
						lineHeight: 1.05,
						letterSpacing: -1,
						transform: `scale(${titleScale})`,
						opacity: titleOpacity,
					}}
				>
					{title}
				</div>
				<div
					style={{
						marginTop: 24,
						fontSize: 40,
						fontWeight: 400,
						lineHeight: 1.2,
						color: 'rgba(248, 247, 244, 0.8)',
						transform: `translateY(${taglineY}px)`,
						opacity: taglineOpacity,
					}}
				>
					{tagline}
				</div>
			</div>
		</SceneShell>
	)
}
