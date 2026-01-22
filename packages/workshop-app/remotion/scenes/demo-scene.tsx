import {
	IFrame,
	interpolate,
	spring,
	useCurrentFrame,
	useVideoConfig,
} from 'remotion'
import { SceneShell } from './scene-shell.tsx'

const codeLines = [
	'export async function action() {',
	'  const user = await requireUser()',
	'  return json({ user })',
	'}',
]

const demoRoutes = [
	{ label: 'Home', path: '/remotion/demo-home.html' },
	{ label: 'Guide', path: '/remotion/demo-guide.html' },
	{ label: 'Workspace', path: '/remotion/demo-workspace.html' },
]

type DemoSceneProps = {
	baseUrl: string
}

export function DemoScene({ baseUrl }: DemoSceneProps) {
	const frame = useCurrentFrame()
	const { fps } = useVideoConfig()

	const headerText = 'Live demo: diff a step in seconds'
	const typedChars = Math.floor(
		interpolate(frame, [0, 1.1 * fps], [0, headerText.length], {
			extrapolateRight: 'clamp',
		}),
	)

	const panelIn = spring({
		fps,
		frame,
		config: { damping: 160, mass: 0.8 },
	})
	const panelOpacity = interpolate(frame, [0, 0.8 * fps], [0, 1], {
		extrapolateRight: 'clamp',
	})

	const navX = interpolate(frame, [0.2 * fps, fps], [-80, 0], {
		extrapolateRight: 'clamp',
	})
	const mainY = interpolate(frame, [0.3 * fps, 1.1 * fps], [40, 0], {
		extrapolateRight: 'clamp',
	})

	const progressWidth = interpolate(
		frame,
		[0.4 * fps, 1.4 * fps],
		[120, 320],
		{ extrapolateRight: 'clamp' },
	)

	const routeDuration = 50
	const routeIndex = Math.min(
		demoRoutes.length - 1,
		Math.floor(frame / routeDuration),
	)
	const activeRoute = demoRoutes[routeIndex]
	const iframeScale = spring({
		fps,
		frame,
		config: { damping: 180, mass: 0.9 },
	})

	return (
		<SceneShell showLogo={false} dim={0.55}>
			<div style={{ maxWidth: 1280 }}>
				<div
					style={{
						fontSize: 44,
						fontWeight: 650,
						letterSpacing: -0.5,
						marginBottom: 32,
					}}
				>
					{headerText.slice(0, typedChars)}
				</div>

				<div
					style={{
						display: 'grid',
						gridTemplateColumns: '280px 1fr',
						gap: 24,
						transform: `scale(${panelIn})`,
						opacity: panelOpacity,
					}}
				>
					<div
						style={{
							padding: 24,
							borderRadius: 20,
							backgroundColor: 'rgba(12, 12, 12, 0.7)',
							border: '1px solid rgba(248, 247, 244, 0.1)',
							transform: `translateX(${navX}px)`,
						}}
					>
						<div
							style={{
								fontSize: 20,
								textTransform: 'uppercase',
								letterSpacing: 2,
								color: 'rgba(248, 247, 244, 0.6)',
							}}
						>
							Exercises
						</div>
						<div
							style={{
								marginTop: 18,
								display: 'grid',
								gap: 12,
								fontSize: 22,
							}}
						>
							<div style={{ color: 'rgba(248, 247, 244, 0.9)' }}>
								01 · Setup
							</div>
							<div style={{ color: 'rgba(248, 247, 244, 0.9)' }}>
								02 · Data flows
							</div>
							<div
								style={{
									padding: '10px 12px',
									borderRadius: 12,
									backgroundColor: 'rgba(248, 247, 244, 0.08)',
									border: '1px solid rgba(248, 247, 244, 0.2)',
									color: '#f8f7f4',
								}}
							>
								03 · Auth patterns
							</div>
							<div style={{ color: 'rgba(248, 247, 244, 0.7)' }}>
								04 · Deploy
							</div>
						</div>
						<div style={{ marginTop: 28 }}>
							<div
								style={{
									fontSize: 14,
									letterSpacing: 1.5,
									textTransform: 'uppercase',
									color: 'rgba(248, 247, 244, 0.5)',
								}}
							>
								Progress
							</div>
							<div
								style={{
									marginTop: 10,
									height: 6,
									borderRadius: 999,
									backgroundColor: 'rgba(248, 247, 244, 0.15)',
									overflow: 'hidden',
								}}
							>
								<div
									style={{
										width: progressWidth,
										height: '100%',
										borderRadius: 999,
										backgroundColor: '#f8f7f4',
									}}
								/>
							</div>
						</div>
					</div>

					<div
						style={{
							display: 'grid',
							gridTemplateRows: 'auto 1fr',
							gap: 18,
							transform: `translateY(${mainY}px)`,
						}}
					>
						<div
							style={{
								padding: '20px 24px',
								borderRadius: 18,
								backgroundColor: 'rgba(12, 12, 12, 0.7)',
								border: '1px solid rgba(248, 247, 244, 0.1)',
								display: 'flex',
								justifyContent: 'space-between',
								alignItems: 'center',
							}}
						>
							<div style={{ display: 'grid', gap: 6 }}>
								<div style={{ fontSize: 26, fontWeight: 600 }}>
									Step 3: Secure session actions
								</div>
								<div style={{ fontSize: 18, color: 'rgba(248, 247, 244, 0.7)' }}>
									Diff + solution preview
								</div>
							</div>
							<div
								style={{
									padding: '10px 16px',
									borderRadius: 999,
									border: '1px solid rgba(248, 247, 244, 0.4)',
									fontSize: 16,
									textTransform: 'uppercase',
									letterSpacing: 1.5,
									color: '#f8f7f4',
								}}
							>
								Live preview
							</div>
						</div>

						<div
							style={{
								display: 'grid',
									gridTemplateColumns: '1fr 1.2fr',
								gap: 18,
							}}
						>
							<div
								style={{
									padding: 24,
									borderRadius: 20,
									backgroundColor: 'rgba(12, 12, 12, 0.7)',
									border: '1px solid rgba(248, 247, 244, 0.1)',
									fontFamily: '"SFMono-Regular", "Menlo", monospace',
									fontSize: 18,
									lineHeight: 1.6,
								}}
							>
								{codeLines.map((line, index) => {
									const delay = index * 6
									const lineOpacity = interpolate(
										frame - delay,
										[0.6 * fps, 1.2 * fps],
										[0, 1],
										{ extrapolateRight: 'clamp' },
									)
									return (
										<div key={line} style={{ opacity: lineOpacity }}>
											{line}
										</div>
									)
								})}
							</div>
							<div
								style={{
									padding: 24,
									borderRadius: 20,
									backgroundColor: 'rgba(12, 12, 12, 0.7)',
									border: '1px solid rgba(248, 247, 244, 0.1)',
									display: 'grid',
									gap: 12,
								}}
							>
								<div
									style={{
										display: 'flex',
										alignItems: 'center',
										justifyContent: 'space-between',
										fontSize: 18,
										color: 'rgba(248, 247, 244, 0.7)',
									}}
								>
									<span>Mock browser demo</span>
									<span style={{ color: 'rgba(248, 247, 244, 0.5)' }}>
										{activeRoute.label}
									</span>
								</div>
								<div
									style={{
										borderRadius: 18,
										border: '1px solid rgba(248, 247, 244, 0.2)',
										backgroundColor: 'rgba(8, 8, 8, 0.8)',
										overflow: 'hidden',
										transform: `scale(${iframeScale})`,
									}}
								>
									<div
										style={{
											display: 'flex',
											alignItems: 'center',
											gap: 10,
											padding: '10px 16px',
											borderBottom: '1px solid rgba(248, 247, 244, 0.1)',
											backgroundColor: 'rgba(248, 247, 244, 0.05)',
											fontSize: 14,
											letterSpacing: 0.4,
										}}
									>
										<div
											style={{
												display: 'flex',
												gap: 6,
											}}
										>
											{['#ff5f57', '#febc2e', '#28c840'].map((color) => (
												<div
													key={color}
													style={{
														width: 10,
														height: 10,
														borderRadius: 999,
														backgroundColor: color,
													}}
												/>
											))}
										</div>
										<div style={{ color: 'rgba(248, 247, 244, 0.6)' }}>
											{`${baseUrl}${activeRoute.path}`}
										</div>
									</div>
									<IFrame
										key={activeRoute.path}
										src={`${baseUrl}${activeRoute.path}`}
										style={{
											width: '100%',
											height: 230,
											border: 'none',
											backgroundColor: '#0b0b0b',
										}}
									/>
								</div>
								<div
									style={{
										display: 'flex',
										gap: 12,
									}}
								>
									<div
										style={{
											flex: 1,
											padding: '10px 12px',
											borderRadius: 12,
											border: '1px solid rgba(0, 255, 170, 0.5)',
											color: '#00ffaa',
											fontSize: 16,
											textAlign: 'center',
										}}
									>
										Tests: 8/8
									</div>
									<div
										style={{
											flex: 1,
											padding: '10px 12px',
											borderRadius: 12,
											border: '1px solid rgba(248, 247, 244, 0.3)',
											color: 'rgba(248, 247, 244, 0.8)',
											fontSize: 16,
											textAlign: 'center',
										}}
									>
										Next step unlocked
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</SceneShell>
	)
}
