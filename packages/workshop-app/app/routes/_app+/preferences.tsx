import {
	getPreferences,
	setPreferences,
} from '@epic-web/workshop-utils/db.server'
import {
	getOfflineVideoSummary,
	startOfflineVideoDownload,
	deleteOfflineVideosForWorkshop,
} from '@epic-web/workshop-utils/offline-videos.server'
import {
	Form,
	Link,
	useFetcher,
	useLoaderData,
	useNavigation,
} from 'react-router'
import { Button } from '#app/components/button.tsx'
import { Icon } from '#app/components/icons.tsx'
import { SimpleTooltip } from '#app/components/ui/tooltip.tsx'
import { formatBytes } from '#app/utils/format.ts'
import { ensureUndeployed, useInterval } from '#app/utils/misc.tsx'
import { useRootLoaderData } from '#app/utils/root-loader.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { type Route } from './+types/preferences.tsx'

const downloadResolutionOptions = [
	{ value: 'best', label: 'Best available' },
	{ value: 'high', label: 'High' },
	{ value: 'medium', label: 'Medium' },
	{ value: 'low', label: 'Low' },
] as const
type DownloadResolutionOption =
	(typeof downloadResolutionOptions)[number]['value']

function isDownloadResolutionOption(
	value: FormDataEntryValue | null,
): value is DownloadResolutionOption {
	return (
		typeof value === 'string' &&
		downloadResolutionOptions.some((option) => option.value === value)
	)
}

export async function loader({ request }: Route.LoaderArgs) {
	ensureUndeployed()
	const [preferences, offlineVideos] = await Promise.all([
		getPreferences(),
		getOfflineVideoSummary({ request }),
	])
	return { preferences, offlineVideos }
}

export async function action({ request }: Route.ActionArgs) {
	ensureUndeployed()
	const formData = await request.formData()
	const intent = formData.get('intent')

	if (intent === 'download-offline-videos') {
		const result = await startOfflineVideoDownload({ request })
		if (result.queued === 0) {
			const description =
				result.available === 0
					? 'No downloadable videos were found for this workshop.'
					: result.unavailable > 0
						? 'All available videos are already downloaded. Some videos require access to download.'
						: 'All available videos are already downloaded.'
			return redirectWithToast('/preferences', {
				title: 'Offline videos are ready',
				description,
				type: 'success',
			})
		}

		return redirectWithToast('/preferences', {
			title: 'Offline downloads started',
			description: `Queued ${result.queued} video${result.queued === 1 ? '' : 's'} for download.`,
			type: 'success',
		})
	}

	if (intent === 'delete-offline-videos') {
		const result = await deleteOfflineVideosForWorkshop()
		const description =
			result.deletedFiles === 0
				? 'No offline videos were removed.'
				: `Removed ${result.deletedFiles} offline video${
						result.deletedFiles === 1 ? '' : 's'
					}.`
		return redirectWithToast('/preferences', {
			title: 'Offline videos cleared',
			description,
			type: 'success',
		})
	}

	const minResolution = formData.get('minResolution')
	const maxResolution = formData.get('maxResolution')
	const downloadResolution = formData.get('downloadResolution')
	const fontSize = formData.get('fontSize')
	const optOutPresence = formData.get('optOutPresence') === 'on'
	const persistPlayground = formData.get('persistPlayground') === 'on'
	const dismissExerciseWarning = formData.get('dismissExerciseWarning') === 'on'
	const downloadResolutionValue = isDownloadResolutionOption(downloadResolution)
		? downloadResolution
		: undefined

	await setPreferences({
		player: {
			minResolution: minResolution ? Number(minResolution) : undefined,
			maxResolution: maxResolution ? Number(maxResolution) : undefined,
		},
		offlineVideo: {
			downloadResolution: downloadResolutionValue,
		},
		fontSize: fontSize ? Number(fontSize) : undefined,
		presence: { optOut: optOutPresence },
		playground: { persist: persistPlayground },
		exerciseWarning: { dismissed: dismissExerciseWarning },
	})

	return redirectWithToast('/preferences', {
		title: 'Preferences updated',
		description: 'Your preferences have been updated.',
		type: 'success',
	})
}

export default function AccountSettings() {
	const loaderData = useLoaderData<typeof loader>()
	const rootData = useRootLoaderData()
	const playerPreferences = rootData.preferences?.player
	const offlineVideoPreferences = rootData.preferences?.offlineVideo
	const fontSizePreference = rootData.preferences?.fontSize
	const presencePreferences = rootData.preferences?.presence
	const playgroundPreferences = rootData.preferences?.playground
	const exerciseWarningPreferences = rootData.preferences?.exerciseWarning
	const navigation = useNavigation()
	const offlineVideosFetcher = useFetcher<typeof loader>()
	const offlineVideos =
		offlineVideosFetcher.data?.offlineVideos ?? loaderData.offlineVideos
	const isDownloading = offlineVideos.downloadState.status === 'running'
	const offlineVideoNotes = [
		offlineVideos.unavailableVideos > 0
			? `${offlineVideos.unavailableVideos} unavailable`
			: null,
		offlineVideos.notDownloadableVideos > 0
			? `${offlineVideos.notDownloadableVideos} not downloadable`
			: null,
	]
		.filter(Boolean)
		.join(', ')
	const showRemainingDownloadSize =
		offlineVideos.totalVideos > 0 &&
		offlineVideos.downloadedVideos < offlineVideos.totalVideos &&
		offlineVideos.remainingDownloadBytes > 0

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
						<p className="text-muted-foreground text-sm">
							Defaults to the best available resolution.
						</p>
					</div>
					<div>
						<div className="mb-2 flex items-center gap-2">
							<h2 className="text-body-xl">Font Size Preference</h2>
							<SimpleTooltip content="Defaults to 16px">
								<Icon name="Question" tabIndex={0} />
							</SimpleTooltip>
						</div>
						<div className="flex items-center gap-2">
							<label htmlFor="fontSize">Font Size</label>
							<input
								type="number"
								id="fontSize"
								name="fontSize"
								defaultValue={fontSizePreference ?? 16}
								step="1"
								min="12"
								max="26"
								className="border-border bg-background text-foreground rounded-md border px-2 py-1"
							/>
						</div>
					</div>

					<div>
						<div className="mb-2 flex items-center gap-2">
							<h2 className="text-body-xl">Presence Preference</h2>

							<SimpleTooltip content="This controls whether your name and avatar are displayed in the pile of faces in navigation">
								<Icon name="Question" tabIndex={0} />
							</SimpleTooltip>
						</div>
						<div className="flex items-center gap-2">
							<input
								type="checkbox"
								id="optOutPresence"
								name="optOutPresence"
								defaultChecked={presencePreferences?.optOut}
							/>
							<label htmlFor="optOutPresence">
								Opt out of presence features
							</label>
						</div>
					</div>

					<div>
						<div className="mb-2 flex items-center gap-2">
							<h2 className="text-body-xl">Persist Playground</h2>

							<SimpleTooltip
								content={`When enabled, clicking "Set to Playground" will save the current playground in the "saved-playgrounds" directory.`}
							>
								<Icon name="Question" tabIndex={0} />
							</SimpleTooltip>
						</div>
						<div className="flex items-center gap-2">
							<input
								type="checkbox"
								id="persistPlayground"
								name="persistPlayground"
								defaultChecked={playgroundPreferences?.persist}
							/>
							<label htmlFor="persistPlayground">
								Enable saving playground
							</label>
						</div>
					</div>

					<div>
						<div className="mb-2 flex items-center gap-2">
							<h2 className="text-body-xl">Exercise Directory Warning</h2>

							<SimpleTooltip
								content={`When enabled, you'll see a warning banner when you have changes in the exercises directory. This helps remind you to work in the playground directory instead.`}
							>
								<Icon name="Question" tabIndex={0} />
							</SimpleTooltip>
						</div>
						<div className="flex items-center gap-2">
							<input
								type="checkbox"
								id="dismissExerciseWarning"
								name="dismissExerciseWarning"
								defaultChecked={exerciseWarningPreferences?.dismissed}
							/>
							<label htmlFor="dismissExerciseWarning">
								Dismiss exercise directory warnings
							</label>
						</div>
					</div>

					<div className="h-4" />

					<Button
						varient="primary"
						type="submit"
						name="intent"
						value="update-preferences"
						disabled={isSubmitting}
					>
						{isSubmitting ? 'Updating...' : 'Update Preferences'}
					</Button>
				</Form>

				<section className="border-border mt-6 flex w-full max-w-xl flex-col gap-3 border-t pt-6">
					<div className="flex items-center gap-2">
						<h2 className="text-body-xl">Offline videos</h2>
						<SimpleTooltip content="Keep videos ready to watch when you're offline.">
							<Icon name="Question" tabIndex={0} />
						</SimpleTooltip>
					</div>
					<p className="text-muted-foreground text-sm">
						Download all workshop videos so you can watch them when offline.
					</p>
					<p className="text-muted-foreground text-sm">
						Admins can manage all downloaded videos on the{' '}
						<Link
							className="text-foreground underline"
							to="/admin/offline-videos"
						>
							Offline videos admin page
						</Link>
						.
					</p>
					<div className="flex flex-wrap items-center gap-3">
						<Form method="post">
							<Button
								varient="primary"
								type="submit"
								name="intent"
								value="download-offline-videos"
								disabled={
									isDownloading ||
									isSubmitting ||
									offlineVideos.totalVideos === 0
								}
							>
								{isDownloading ? 'Downloading...' : 'Download all videos'}
							</Button>
						</Form>
						<Form method="post">
							<button
								type="submit"
								name="intent"
								value="delete-offline-videos"
								disabled={isSubmitting || offlineVideos.downloadedVideos === 0}
								className="border-border text-foreground hover:bg-muted inline-flex items-center gap-2 rounded border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
							>
								Delete offline videos
							</button>
						</Form>
						<span className="text-muted-foreground text-sm">
							{offlineVideos.downloadedVideos} of {offlineVideos.totalVideos}{' '}
							downloaded
							{offlineVideoNotes ? ` (${offlineVideoNotes})` : null}
						</span>
					</div>
					<div className="text-muted-foreground text-sm">
						{offlineVideos.downloadedVideos > 0 ? (
							<p>Downloaded size: {formatBytes(offlineVideos.totalBytes)}</p>
						) : null}
						{showRemainingDownloadSize ? (
							<p>
								Download all size:{' '}
								{formatBytes(offlineVideos.remainingDownloadBytes)}
							</p>
						) : null}
					</div>
					{isDownloading ? (
						<div className="text-muted-foreground text-sm">
							<p>
								Downloading {offlineVideos.downloadState.completed} of{' '}
								{offlineVideos.downloadState.total} videos
							</p>
							{offlineVideos.downloadState.current ? (
								<p className="truncate">
									Current: {offlineVideos.downloadState.current.title}
								</p>
							) : null}
						</div>
					) : null}
				</section>
			</main>
		</div>
	)
}
