import { toast as showToast } from 'sonner'
import { Icon } from '#app/components/icons'
import { type InBrowserBrowserRef } from '#app/components/in-browser-browser'
import { SimpleTooltip } from '#app/components/ui/tooltip'
import { PlaygroundWindow } from './playground-window'
import { Preview } from './preview'

export function Playground({
	appInfo: playgroundAppInfo,
	inBrowserBrowserRef,
	problemAppName,
	allApps,
}: {
	appInfo: Parameters<typeof Preview>['0']['appInfo'] | null
	inBrowserBrowserRef: React.RefObject<InBrowserBrowserRef>
	problemAppName?: string
	allApps: Array<{ name: string; displayName: string }>
}) {
	return (
		<PlaygroundWindow
			playgroundAppName={playgroundAppInfo?.appName}
			problemAppName={problemAppName}
			allApps={allApps}
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
									onClick={() => {
										navigator.clipboard.writeText(playgroundAppInfo.fullPath)
										showToast.success('Copied playground path to clipboard')
									}}
								>
									<Icon name="CheckSmall">the playground directory</Icon>
								</span>
							</SimpleTooltip>{' '}
							in your editor and terminal to work on this exercise!
						</div>
					</div>
				</div>
			) : (
				<Preview
					id={playgroundAppInfo?.appName}
					appInfo={playgroundAppInfo}
					inBrowserBrowserRef={inBrowserBrowserRef}
				/>
			)}
		</PlaygroundWindow>
	)
}
