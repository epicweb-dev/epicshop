import { Icon } from '#app/components/icons'
import { PersistPlaygroundTip } from '#app/components/persist-playground-tip'
import { SimpleTooltip } from '#app/components/ui/tooltip.tsx'
import { PlaygroundChooser, SetPlayground } from '#app/routes/set-playground'
import { useRootLoaderData } from '#app/utils/root-loader'

export function PlaygroundWindow({
	playgroundAppName,
	problemAppName,
	isUpToDate,
	allApps,
	children,
}: {
	playgroundAppName?: string
	problemAppName?: string
	isUpToDate: boolean
	allApps: Array<{ name: string; displayName: string }>
	children: React.ReactNode
}) {
	const rootData = useRootLoaderData()
	const playgroundPreferences = rootData.preferences?.playground
	const playgroundTipPreferences = rootData.preferences?.playgroundTip

	// Show the tip if:
	// 1. Persist playground is not enabled
	// 2. The tip hasn't been dismissed
	const showPersistPlaygroundTip =
		!playgroundPreferences?.persist && !playgroundTipPreferences?.dismissed
	const isCorrectApp = playgroundAppName === problemAppName
	const playgroundLinkedUI =
		isCorrectApp && isUpToDate ? (
			<Icon size="xl" name="Linked" />
		) : (
			<Icon
				size="xl"
				name="Unlinked"
				className="text-foreground-destructive animate-pulse"
			/>
		)
	let setPlaygroundTooltipText = 'Click to reset Playground.'
	if (!isUpToDate) {
		setPlaygroundTooltipText =
			'Playground is out of date. Click to reset Playground.'
	}
	if (!isCorrectApp) {
		setPlaygroundTooltipText =
			'Playground is not set to the right app. Click to set Playground.'
	}
	return (
		<div className="flex h-full w-full flex-col justify-between">
			<div className="flex h-14 shrink-0 items-center justify-start gap-2 border-b px-3">
				<div className="display-alt-up">
					{problemAppName ? (
						<SetPlayground
							appName={problemAppName}
							tooltipText={setPlaygroundTooltipText}
						>
							{playgroundLinkedUI}
						</SetPlayground>
					) : (
						<SimpleTooltip content="No problem app available for this step">
							<div>
								<Icon name="Question" />
							</div>
						</SimpleTooltip>
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
			{showPersistPlaygroundTip ? (
				<div className="shrink-0 border-b p-3">
					<PersistPlaygroundTip />
				</div>
			) : null}
			<div className="flex min-h-0 flex-1 grow items-stretch justify-center overflow-hidden">
				{children}
			</div>
		</div>
	)
}
