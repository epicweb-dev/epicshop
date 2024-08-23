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
	appInfo: Pick<PlaygroundApp, 'appName' | 'name' | 'test'> | null
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
			<TestUI playgroundAppInfo={playgroundAppInfo} />
		</PlaygroundWindow>
	)
}

export function TestUI({
	playgroundAppInfo,
}: {
	playgroundAppInfo: Pick<PlaygroundApp, 'name' | 'test'> | null
}) {
	const [inBrowserTestKey, setInBrowserTestKey] = useState(0)

	if (!playgroundAppInfo) {
		return (
			<div className="flex h-full items-center justify-center text-lg">
				<p>No tests here 😢 Sorry.</p>
			</div>
		)
	}

	if (playgroundAppInfo.test.type === 'script') {
		return <TestOutput name={playgroundAppInfo.name} />
	}

	if (playgroundAppInfo.test.type === 'browser') {
		const { pathname } = playgroundAppInfo.test
		return (
			<div
				className="flex h-full w-full flex-grow flex-col overflow-y-auto"
				key={inBrowserTestKey}
			>
				{playgroundAppInfo.test.testFiles.map((testFile) => (
					<div key={testFile}>
						<InBrowserTestRunner pathname={pathname} testFile={testFile} />
					</div>
				))}
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
		<div className="flex h-full items-center justify-center text-lg">
			<p>No tests here 😢 Sorry.</p>
		</div>
	)
}
