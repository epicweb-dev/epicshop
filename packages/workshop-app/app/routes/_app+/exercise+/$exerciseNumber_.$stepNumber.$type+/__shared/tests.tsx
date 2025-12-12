import { type PlaygroundApp } from '@epic-web/workshop-utils/apps.server'
import { useState } from 'react'
import { DeferredEpicVideo } from '#app/components/epic-video.js'
import { Icon } from '#app/components/icons'
import { InBrowserTestRunner } from '#app/components/in-browser-test-runner'
import { useUserHasAccessToLesson } from '#app/components/user.tsx'
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
	const userHasAccess = useUserHasAccessToLesson()

	if (!userHasAccess) {
		return (
			<div className="w-full p-12">
				<div className="flex w-full flex-col gap-4 text-center">
					<p className="text-2xl font-bold">Access Denied</p>
					<p className="text-lg">
						You must login and have access to this lesson to view and run the
						tests.
					</p>
				</div>
				<div className="h-16" />
				<p className="pb-4">
					Check out this video to see how the test tab works.
				</p>
				<DeferredEpicVideo url="https://www.epicweb.dev/tips/epic-workshop-test-tab-demo" />
			</div>
		)
	}

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
