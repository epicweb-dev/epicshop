import { type InBrowserBrowserRef } from '#app/components/in-browser-browser'
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
			<Preview
				id={playgroundAppInfo?.appName}
				appInfo={playgroundAppInfo}
				inBrowserBrowserRef={inBrowserBrowserRef}
			/>
		</PlaygroundWindow>
	)
}
