import { type PlaygroundApp } from '@epic-web/workshop-utils/apps.server'
import { useState } from 'react'
import { Icon } from '#app/components/icons'
import { InBrowserTestRunner } from '#app/components/in-browser-test-runner'
import { TestOutput } from '#app/routes/test'
import { PlaygroundWindow } from './playground-window'

export function Tests({
	appInfo: playgroundAppInfo,
	problemAppName,
	allApps,
	isUpToDate,
}: {
	appInfo: Pick<PlaygroundApp, 'appName' | 'name' | 'type' | 'test'> | null
	problemAppName?: string
	allApps: Array<{ name: string; displayName: string }>
	isUpToDate: boolean
}) {
	const [inBrowserTestKey, setInBrowserTestKey] = useState(0)
	let testUI = <p>No tests here. Sorry.</p>
	if (playgroundAppInfo?.test.type === 'script') {
		testUI = <TestOutput name={playgroundAppInfo.name} />
	}
	if (playgroundAppInfo?.test.type === 'browser') {
		const { pathname } = playgroundAppInfo.test
		testUI = (
			<div
				className="flex h-full w-full flex-grow flex-col"
				key={inBrowserTestKey}
			>
				{playgroundAppInfo.test.testFiles.map((testFile) => {
					return (
						<div key={testFile}>
							<InBrowserTestRunner pathname={pathname} testFile={testFile} />
						</div>
					)
				})}
				<div className="px-3 py-[21px]">
					<button
						onClick={() => setInBrowserTestKey((c) => c + 1)}
						className="flex items-center gap-2 font-mono text-sm uppercase leading-none"
					>
						<Icon name="Refresh" aria-hidden /> Rerun All Tests
					</button>
				</div>
			</div>
		)
	}
	return (
		<PlaygroundWindow
			playgroundAppName={playgroundAppInfo?.appName}
			problemAppName={problemAppName}
			allApps={allApps}
			isUpToDate={isUpToDate}
		>
			{testUI}
		</PlaygroundWindow>
	)
}
