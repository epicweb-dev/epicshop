import type { ReactNode } from 'react'
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from 'remotion'

type SceneShellProps = {
	children: ReactNode
	showLogo?: boolean
	dim?: number
}

export function SceneShell({
	children,
	showLogo = true,
	dim = 0.6,
}: SceneShellProps) {
	const frame = useCurrentFrame()
	const backgroundScale = 1.04 + Math.sin(frame / 90) * 0.01
	const backgroundOffset = Math.sin(frame / 120) * 10
	const logoOpacity = interpolate(frame, [0, 20], [0, 1], {
		extrapolateRight: 'clamp',
	})
	const backgroundSrc = staticFile('og/background.png')
	const logoSrc = staticFile('logo.svg')

	return (
		<AbsoluteFill style={{ backgroundColor: '#050505' }}>
			<Img
				src={backgroundSrc}
				style={{
					position: 'absolute',
					inset: 0,
					width: '100%',
					height: '100%',
					objectFit: 'cover',
					transform: `scale(${backgroundScale}) translateY(${backgroundOffset}px)`,
				}}
			/>
			<div
				style={{
					position: 'absolute',
					inset: 0,
					backgroundColor: `rgba(5, 5, 5, ${dim})`,
				}}
			/>
			{showLogo ? (
				<div
					style={{
						position: 'absolute',
						top: 48,
						left: 64,
						display: 'flex',
						alignItems: 'center',
						gap: 16,
						opacity: logoOpacity,
					}}
				>
					<Img
						src={logoSrc}
						style={{
							width: 120,
							height: 120,
							opacity: 0.95,
						}}
					/>
				</div>
			) : null}
			<AbsoluteFill
				style={{
					padding: '140px 120px 120px',
					display: 'flex',
					flexDirection: 'column',
					justifyContent: 'center',
					color: '#f8f7f4',
					fontFamily:
						'"Neogrotesk", "Inter", "Helvetica Neue", Arial, sans-serif',
				}}
			>
				{children}
			</AbsoluteFill>
		</AbsoluteFill>
	)
}
