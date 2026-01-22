import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { SceneShell } from './scene-shell.tsx'

const highlights = [
	{
		label: 'Build momentum',
		value: 'Track progress step-by-step',
	},
	{
		label: 'Stay focused',
		value: 'Clear tasks and feedback loops',
	},
	{
		label: 'Ship with confidence',
		value: 'Patterns you can reuse at work',
	},
]

export function MomentumScene() {
	const frame = useCurrentFrame()
	const { fps } = useVideoConfig()

	const headerOpacity = interpolate(frame, [0, 0.7 * fps], [0, 1], {
		extrapolateRight: 'clamp',
	})

	return (
		<SceneShell>
			<div style={{ maxWidth: 1200 }}>
				<div
					style={{
						fontSize: 56,
						fontWeight: 650,
						marginBottom: 40,
						opacity: headerOpacity,
					}}
				>
					Stay in flow from start to finish
				</div>
				<div style={{ display: 'grid', gap: 28 }}>
					{highlights.map((item, index) => {
						const delay = index * 8
						const reveal = spring({
							fps,
							frame: frame - delay,
							config: { damping: 140, mass: 0.9 },
						})
						const opacity = interpolate(frame - delay, [0.2 * fps, fps], [0, 1], {
							extrapolateRight: 'clamp',
						})

						return (
							<div
								key={item.label}
								style={{
									padding: '26px 32px',
									borderRadius: 20,
									backgroundColor: 'rgba(12, 12, 12, 0.65)',
									border: '1px solid rgba(248, 247, 244, 0.12)',
									transform: `translateY(${(1 - reveal) * 18}px)`,
									opacity,
								}}
							>
								<div
									style={{
										fontSize: 28,
										textTransform: 'uppercase',
										letterSpacing: 2,
										color: 'rgba(248, 247, 244, 0.6)',
									}}
								>
									{item.label}
								</div>
								<div
									style={{
										marginTop: 10,
										fontSize: 36,
										fontWeight: 600,
									}}
								>
									{item.value}
								</div>
							</div>
						)
					})}
				</div>
			</div>
		</SceneShell>
	)
}
