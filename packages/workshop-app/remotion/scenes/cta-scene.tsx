import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { SceneShell } from './scene-shell.tsx'

type CtaSceneProps = {
	cta: string
}

export function CtaScene({ cta }: CtaSceneProps) {
	const frame = useCurrentFrame()
	const { fps } = useVideoConfig()

	const headlineOpacity = interpolate(frame, [0, 0.8 * fps], [0, 1], {
		extrapolateRight: 'clamp',
	})
	const buttonScale = spring({
		fps,
		frame: frame - 10,
		config: { damping: 160, mass: 0.7 },
	})

	return (
		<SceneShell dim={0.4}>
			<div
				style={{
					maxWidth: 1100,
					display: 'flex',
					flexDirection: 'column',
					gap: 28,
				}}
			>
				<div
					style={{
						fontSize: 68,
						fontWeight: 700,
						letterSpacing: -1,
						opacity: headlineOpacity,
					}}
				>
					Build skill. Build momentum. Build projects.
				</div>
				<div
					style={{
						fontSize: 34,
						color: 'rgba(248, 247, 244, 0.85)',
						maxWidth: 820,
					}}
				>
					{cta}
				</div>
				<div
					style={{
						marginTop: 16,
						fontSize: 24,
						letterSpacing: 2,
						textTransform: 'uppercase',
						color: 'rgba(248, 247, 244, 0.7)',
						transform: `translateY(${(1 - buttonScale) * 12}px)`,
					}}
				>
					Epic Web workshops · epicweb.dev
				</div>
			</div>
		</SceneShell>
	)
}
