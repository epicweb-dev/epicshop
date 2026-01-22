import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import { SceneShell } from './scene-shell.tsx'

const features = [
	'Real-world exercises with guided steps',
	'Tooling that mirrors professional workflows',
	'Instant checkpoints to keep you moving',
]

export function FeaturesScene() {
	const frame = useCurrentFrame()
	const { fps } = useVideoConfig()

	const titleOpacity = interpolate(frame, [0, 0.8 * fps], [0, 1], {
		extrapolateRight: 'clamp',
	})

	return (
		<SceneShell>
			<div style={{ maxWidth: 1100 }}>
				<div
					style={{
						fontSize: 60,
						fontWeight: 650,
						letterSpacing: -0.5,
						opacity: titleOpacity,
					}}
				>
					Learn by shipping real app code
				</div>
				<div style={{ marginTop: 48, display: 'grid', gap: 24 }}>
					{features.map((feature, index) => {
						const delay = index * 6
						const itemOpacity = interpolate(
							frame - delay,
							[0.4 * fps, 1.2 * fps],
							[0, 1],
							{ extrapolateRight: 'clamp' },
						)
						const itemX = interpolate(
							frame - delay,
							[0.4 * fps, 1.2 * fps],
							[30, 0],
							{ extrapolateRight: 'clamp' },
						)
						return (
							<div
								key={feature}
								style={{
									display: 'flex',
									alignItems: 'center',
									gap: 18,
									fontSize: 34,
									fontWeight: 500,
									color: 'rgba(248, 247, 244, 0.9)',
									transform: `translateX(${itemX}px)`,
									opacity: itemOpacity,
								}}
							>
								<div
									style={{
										width: 14,
										height: 14,
										borderRadius: 999,
										backgroundColor: '#f8f7f4',
									}}
								/>
								<span>{feature}</span>
							</div>
						)
					})}
				</div>
			</div>
		</SceneShell>
	)
}
