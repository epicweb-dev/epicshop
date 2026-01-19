import { toast as showToast } from 'sonner'
import { Icon } from '#app/components/icons.tsx'
import { type InBrowserBrowserRef } from '#app/components/in-browser-browser'
import { SimpleTooltip } from '#app/components/ui/tooltip'
import { SetAppToPlayground } from '#app/routes/set-playground'
import { PlaygroundWindow } from './playground-window'
import { Preview } from './preview'

export function Playground({
	appInfo: playgroundAppInfo,
	inBrowserBrowserRef,
	problemAppName,
	allApps,
	isUpToDate,
}: {
	appInfo: Parameters<typeof Preview>['0']['appInfo'] | null
	inBrowserBrowserRef: React.RefObject<InBrowserBrowserRef | null>
	problemAppName?: string
	allApps: Array<{ name: string; displayName: string }>
	isUpToDate: boolean
}) {
	return (
		<PlaygroundWindow
			playgroundAppName={playgroundAppInfo?.appName}
			problemAppName={problemAppName}
			allApps={allApps}
			isUpToDate={isUpToDate}
		>
			{playgroundAppInfo?.dev?.type === 'none' ? (
				<div className="flex h-full flex-col items-center justify-center gap-4">
					<div className="text-secondary-foreground text-2xl">
						Non-UI exercise
					</div>
					<div className="text-secondary-foreground max-w-md text-center text-balance">
						This exercise has no application or other UI associated with it.{' '}
						<br />
						Navigate to{' '}
						<SimpleTooltip content={playgroundAppInfo.fullPath}>
							<span
								className="inline-flex cursor-pointer items-center gap-1.5 underline"
								onClick={() => {
									void navigator.clipboard.writeText(playgroundAppInfo.fullPath)
									showToast.success('Copied playground path to clipboard')
								}}
							>
								the playground directory
								<Icon name="Copy" size="sm" />
							</span>
						</SimpleTooltip>{' '}
						in your editor and follow the exercise instructions to complete it.
					</div>
				</div>
			) : playgroundAppInfo ? (
				<Preview
					id={playgroundAppInfo.appName}
					appInfo={playgroundAppInfo}
					inBrowserBrowserRef={inBrowserBrowserRef}
				/>
			) : (
				<div className="flex flex-col justify-center gap-2">
					<p>Please set the playground first</p>
					{problemAppName ? (
						<SetAppToPlayground appName={problemAppName} />
					) : null}
				</div>
			)}
		</PlaygroundWindow>
	)
}
