import { Icon } from '#app/components/icons'
import { PlaygroundChooser, SetPlayground } from '#app/routes/set-playground'

export function PlaygroundWindow({
	playgroundAppName,
	problemAppName,
	allApps,
	children,
}: {
	playgroundAppName?: string
	problemAppName?: string
	allApps: Array<{ name: string; displayName: string }>
	children: React.ReactNode
}) {
	const isCorrectApp = playgroundAppName === problemAppName
	const playgroundLinkedUI = isCorrectApp ? (
		<Icon size={28} name="Linked" />
	) : (
		<Icon
			size={28}
			name="Unlinked"
			className="animate-pulse text-foreground-danger"
		/>
	)
	return (
		<div className="flex h-full w-full flex-col justify-between">
			<div className="flex h-14 flex-shrink-0 items-center justify-start gap-2 border-b border-border px-3">
				<div className="display-alt-up flex">
					{problemAppName ? (
						<SetPlayground
							appName={problemAppName}
							tooltipText={
								isCorrectApp
									? 'Click to reset Playground.'
									: 'Playground is not set to the right app. Click to set Playground.'
							}
						>
							{playgroundLinkedUI}
						</SetPlayground>
					) : (
						<div className="flex">{playgroundLinkedUI}</div>
					)}
				</div>
				<div className="display-alt-down">
					{playgroundAppName ? (
						<SetPlayground
							appName={playgroundAppName}
							reset
							tooltipText="Reset Playground"
						>
							<div className="flex h-7 w-7 items-center justify-center">
								<Icon name="Refresh" />
							</div>
						</SetPlayground>
					) : (
						<div className="h-7 w-7" />
					)}
				</div>
				<PlaygroundChooser
					allApps={allApps}
					playgroundAppName={playgroundAppName}
				/>
			</div>
			<div className="flex h-full flex-1 flex-grow items-center justify-center">
				{children}
			</div>
		</div>
	)
}
