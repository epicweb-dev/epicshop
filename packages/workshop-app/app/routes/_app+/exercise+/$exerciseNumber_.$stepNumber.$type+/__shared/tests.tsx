import { type PlaygroundApp } from '@epic-web/workshop-utils/apps.server'
import { Suspense, useState } from 'react'
import { ErrorBoundary } from 'react-error-boundary'
import { Await } from 'react-router'
import { DeferredEpicVideo } from '#app/components/epic-video.tsx'
import { Icon } from '#app/components/icons'
import { InBrowserTestRunner } from '#app/components/in-browser-test-runner'
import { SimpleTooltip } from '#app/components/ui/tooltip.tsx'
import { TestOutput } from '#app/routes/test'
import { PlaygroundWindow } from './playground-window'

export function Tests({
	appInfo: playgroundAppInfo,
	problemAppName,
	allApps,
	isUpToDate,
	userHasAccessPromise,
}: {
	appInfo: Pick<PlaygroundApp, 'appName' | 'name' | 'test'> | null
	problemAppName?: string
	allApps: Array<{ name: string; displayName: string }>
	isUpToDate: boolean
	userHasAccessPromise: Promise<boolean>
}) {
	return (
		<PlaygroundWindow
			playgroundAppName={playgroundAppInfo?.appName}
			problemAppName={problemAppName}
			allApps={allApps}
			isUpToDate={isUpToDate}
		>
			<ErrorBoundary
				fallbackRender={() => (
					<div className="w-full p-12">
						<div className="flex w-full flex-col gap-4 text-center">
							<p className="text-2xl font-bold">Error</p>
							<p className="text-lg">
								There was an error loading the user access.
							</p>
						</div>
					</div>
				)}
			>
				<Suspense
					fallback={
						<div className="flex items-center justify-center p-8">
							<SimpleTooltip content="Loading user access">
								<Icon name="Refresh" className="animate-spin" />
							</SimpleTooltip>
						</div>
					}
				>
					<Await resolve={userHasAccessPromise}>
						{(userHasAccess) => (
							<TestUI
								playgroundAppInfo={playgroundAppInfo}
								userHasAccess={userHasAccess}
							/>
						)}
					</Await>
				</Suspense>
			</ErrorBoundary>
		</PlaygroundWindow>
	)
}

export function TestUI({
	userHasAccess,
	playgroundAppInfo,
}: {
	playgroundAppInfo: Pick<PlaygroundApp, 'name' | 'test'> | null
	userHasAccess: boolean
}) {
	const [inBrowserTestKey, setInBrowserTestKey] = useState(0)

	if (!userHasAccess) {
		return (
			<div className="w-full p-12">
				<div className="flex w-full flex-col gap-4 text-center">
					<p className="text-2xl font-bold">Access Denied</p>
					<p className="text-lg">
						You must login or register for the workshop to view and run the
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
				className="flex h-full min-h-0 w-full grow flex-col overflow-y-auto"
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
						className="flex items-center gap-2 font-mono text-sm leading-none uppercase"
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
