import { type InBrowserBrowserRef } from '#app/components/in-browser-browser'
import { SimpleTooltip } from '#app/components/ui/tooltip'
import { SetAppToPlayground } from '#app/routes/set-playground'
import { toast as showToast } from 'sonner'
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
			{playgroundAppInfo?.dev.type === 'none' ? (
				<div>
					<div className="text-foreground-secondary flex h-full items-center justify-center text-2xl">
						Non-UI playground
					</div>
					<div>
						<div className="text-foreground-secondary flex flex-wrap gap-1 text-center">
							Navigate to{' '}
							<SimpleTooltip content={playgroundAppInfo.fullPath}>
								<span
									className="underline"
									onClick={() => {
										void navigator.clipboard.writeText(
											playgroundAppInfo.fullPath,
										)
										showToast.success('Copied playground path to clipboard')
									}}
								>
									the playground directory
								</span>
							</SimpleTooltip>{' '}
							in your editor and terminal to work on this exercise!
						</div>
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
