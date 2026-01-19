'use client'

import {
	Form,
	Link,
	useFetcher,
	useLoaderData,
	useNavigation,
} from 'react-router'
import { Button } from '#app/components/button.tsx'
import { Icon } from '#app/components/icons.tsx'
import { useInterval } from '#app/utils/misc.client.tsx'
import { useRootLoaderData } from '#app/utils/root-loader.ts'
import { type Route } from './+types/preferences.tsx'
import { downloadResolutionOptions } from './preferences-constants.ts'

export default function AccountSettings() {
	const loaderData = useLoaderData<Route.ComponentProps['loaderData']>()
	const rootData = useRootLoaderData()
	const playerPreferences = rootData.preferences?.player
	const offlineVideoPreferences = rootData.preferences?.offlineVideo
	const fontSizePreference = rootData.preferences?.fontSize
	const presencePreferences = rootData.preferences?.presence
	const playgroundPreferences = rootData.preferences?.playground
	const exerciseWarningPreferences = rootData.preferences?.exerciseWarning
	const navigation = useNavigation()
	const offlineVideosFetcher = useFetcher<Route.ComponentProps['loaderData']>()
	const offlineVideos =
		offlineVideosFetcher.data?.offlineVideos ?? loaderData.offlineVideos
	const downloadState = offlineVideos.downloadState
	const queuedDownloads =
		downloadState.status === 'running'
			? Math.max(downloadState.total - downloadState.completed, 0)
			: 0
	const downloadErrorMessage = downloadState.errors[0]?.error
	const downloadResolutionLabel =
		downloadResolutionOptions.find(
			(option) => option.value === offlineVideoPreferences?.downloadResolution,
		)?.label ?? 'Auto'
	const minResolutionLabel = playerPreferences?.minResolution
		? `${playerPreferences.minResolution}p`
		: 'Auto'
	const maxResolutionLabel = playerPreferences?.maxResolution
		? `${playerPreferences.maxResolution}p`
		: 'Auto'
	const downloadProgressMessage = downloadState.current
		? `Downloading ${downloadState.current.title} (${
				downloadState.completed + 1
			}/${downloadState.total})`
		: downloadState.total > 0
			? `Preparing downloads (${downloadState.completed}/${downloadState.total})`
			: 'Preparing downloads'
	const isDownloading = offlineVideos.downloadState.status === 'running'

	const isSubmitting = navigation.state === 'submitting'

	useInterval(
		() => {
			if (offlineVideosFetcher.state === 'idle') {
				void offlineVideosFetcher.load('/resources/offline-videos')
			}
		},
		isDownloading ? 2000 : null,
	)

	return (
		<div className="h-full w-full overflow-y-auto">
			<main className="container mt-12 flex w-full max-w-3xl grow flex-col gap-4 pb-24">
				<h1 className="text-h1 mb-4">Preferences</h1>
				<Form method="post" className="flex w-full max-w-sm flex-col gap-4">
					<div>
						<h2 className="text-body-xl mb-2">Video Player Preferences</h2>
						<div className="flex items-center gap-2">
							<label htmlFor="minResolution">Minimum Resolution:</label>
							<select
								id="minResolution"
								name="minResolution"
								defaultValue={playerPreferences?.minResolution}
								className="border-border bg-background text-foreground rounded-md border px-2 py-1"
							>
								<option value="">Auto</option>
								<option value="480">480p</option>
								<option value="720">720p</option>
								<option value="1080">1080p</option>
								<option value="1440">1440p</option>
								<option value="2160">2160p (4K)</option>
							</select>
						</div>
						<div className="flex items-center gap-2">
							<label htmlFor="maxResolution">Maximum Resolution:</label>
							<select
								id="maxResolution"
								name="maxResolution"
								defaultValue={playerPreferences?.maxResolution}
								className="border-border bg-background text-foreground rounded-md border px-2 py-1"
							>
								<option value="">Auto</option>
								<option value="720">720p</option>
								<option value="1080">1080p</option>
								<option value="1440">1440p</option>
								<option value="2160">2160p (4K)</option>
							</select>
						</div>
					</div>
					<div>
						<h2 className="text-body-xl mb-2">Offline Video Downloads</h2>
						<div className="flex items-center gap-2">
							<label htmlFor="downloadResolution">Download Resolution:</label>
							<select
								id="downloadResolution"
								name="downloadResolution"
								defaultValue={
									offlineVideoPreferences?.downloadResolution ?? 'best'
								}
								className="border-border bg-background text-foreground rounded-md border px-2 py-1"
							>
								{downloadResolutionOptions.map((option) => (
									<option key={option.value} value={option.value}>
										{option.label}
									</option>
								))}
							</select>
						</div>
					</div>
					<div>
						<h2 className="text-body-xl mb-2">Font Size Preference</h2>
						<div className="flex items-center gap-2">
							<label htmlFor="fontSize">Font Size:</label>
							<select
								id="fontSize"
								name="fontSize"
								defaultValue={fontSizePreference ?? 16}
								className="border-border bg-background text-foreground rounded-md border px-2 py-1"
							>
								<option value="14">Small</option>
								<option value="16">Medium</option>
								<option value="18">Large</option>
								<option value="20">Extra Large</option>
							</select>
						</div>
					</div>
					<div className="space-y-2">
						<h2 className="text-body-xl">Presence</h2>
						<label className="flex items-center gap-2">
							<input
								type="checkbox"
								name="optOutPresence"
								defaultChecked={presencePreferences?.optOut}
							/>
							Opt out of presence (hide your avatar)
						</label>
					</div>
					<div className="space-y-2">
						<h2 className="text-body-xl">Playground</h2>
						<label className="flex items-center gap-2">
							<input
								type="checkbox"
								name="persistPlayground"
								defaultChecked={playgroundPreferences?.persist}
							/>
							Enable playground persistence (save a copy each time)
						</label>
					</div>
					<div className="space-y-2">
						<h2 className="text-body-xl">Exercise Warning</h2>
						<label className="flex items-center gap-2">
							<input
								type="checkbox"
								name="dismissExerciseWarning"
								defaultChecked={exerciseWarningPreferences?.dismissed}
							/>
							Dismiss exercise warning
						</label>
					</div>
					<div className="flex gap-2">
						<Button varient="primary" type="submit" disabled={isSubmitting}>
							{isSubmitting ? 'Saving...' : 'Save Preferences'}
						</Button>
						<Button
							varient="mono"
							type="button"
							onClick={() => {
								window.location.reload()
							}}
						>
							Reset
						</Button>
					</div>
				</Form>
				<div className="border-border mt-10 flex flex-col gap-4 border-t pt-6">
					<h2 className="text-body-xl">Offline Video Summary</h2>
					<div className="flex flex-wrap gap-4">
						<div className="border-border bg-card flex flex-col gap-1 rounded-md border px-4 py-3">
							<span className="text-muted-foreground text-xs uppercase">
								Status
							</span>
							<span className="text-sm font-semibold">
								{downloadState.status === 'running'
									? 'Downloading'
									: downloadState.status === 'error'
										? 'Error'
										: downloadState.status === 'completed'
											? 'Completed'
											: 'Idle'}
							</span>
						</div>
						<div className="border-border bg-card flex flex-col gap-1 rounded-md border px-4 py-3">
							<span className="text-muted-foreground text-xs uppercase">
								Downloaded
							</span>
							<span className="text-sm font-semibold">
								{offlineVideos.downloadedVideos ?? 0}
							</span>
						</div>
						<div className="border-border bg-card flex flex-col gap-1 rounded-md border px-4 py-3">
							<span className="text-muted-foreground text-xs uppercase">
								Queued
							</span>
							<span className="text-sm font-semibold">
								{queuedDownloads}
							</span>
						</div>
					</div>
					<div className="flex flex-wrap gap-2">
						<Button
							varient="primary"
							type="submit"
							name="intent"
							value="download-offline-videos"
							disabled={isDownloading}
							form="offlineVideoForm"
						>
							{isDownloading ? 'Downloading...' : 'Download Offline Videos'}
						</Button>
						<Button
							varient="mono"
							type="submit"
							name="intent"
							value="delete-offline-videos"
							form="offlineVideoForm"
						>
							Delete Offline Videos
						</Button>
					</div>
					<Form id="offlineVideoForm" method="post" className="hidden" />
					{downloadErrorMessage ? (
						<div className="text-foreground-destructive text-sm">
							{downloadErrorMessage}
						</div>
					) : null}
					{offlineVideos.downloadState.status === 'running' ? (
						<div className="text-muted-foreground text-sm">
							Downloading offline videos. This may take a few minutes.
						</div>
					) : null}
					<div className="text-muted-foreground text-xs">
						Need help?{' '}
						<Link to="/support" className="underline">
							Contact support
						</Link>
					</div>
				</div>
				<div className="border-border mt-10 flex flex-col gap-4 border-t pt-6">
					<h2 className="text-body-xl">Offline Video Settings</h2>
					<div className="flex flex-wrap gap-4">
						<div className="border-border bg-card flex flex-col gap-1 rounded-md border px-4 py-3">
							<span className="text-muted-foreground text-xs uppercase">
								Min
							</span>
							<span className="text-sm font-semibold">
								{minResolutionLabel}
							</span>
						</div>
						<div className="border-border bg-card flex flex-col gap-1 rounded-md border px-4 py-3">
							<span className="text-muted-foreground text-xs uppercase">
								Max
							</span>
							<span className="text-sm font-semibold">
								{maxResolutionLabel}
							</span>
						</div>
						<div className="border-border bg-card flex flex-col gap-1 rounded-md border px-4 py-3">
							<span className="text-muted-foreground text-xs uppercase">
								Resolution
							</span>
							<span className="text-sm font-semibold">
								{downloadResolutionLabel}
							</span>
						</div>
					</div>
				</div>
				{downloadState.status === 'running' ? (
					<div className="border-border mt-10 flex flex-col gap-4 border-t pt-6">
						<h2 className="text-body-xl">Download Progress</h2>
						<div className="border-border bg-card rounded-md border p-4">
							<div className="mb-2 flex items-center gap-2">
								<Icon name="TriangleSmall" className="animate-pulse" />
								<span className="text-sm font-semibold">Downloading...</span>
							</div>
							<div className="text-muted-foreground text-sm">
								{downloadProgressMessage}
							</div>
						</div>
					</div>
				) : null}
			</main>
		</div>
	)
}
