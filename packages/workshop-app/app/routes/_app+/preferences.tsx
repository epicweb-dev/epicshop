import {
	getPreferences,
	setPreferences,
} from '@epic-web/workshop-utils/db.server'
import {
	getOfflineVideoSummary,
	startOfflineVideoDownload,
	deleteOfflineVideosForWorkshop,
} from '@epic-web/workshop-utils/offline-videos.server'
import { ensureUndeployed } from '#app/utils/misc.tsx'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { type Route } from './+types/preferences.tsx'
import Preferences from './preferences.client.tsx'
import { isDownloadResolutionOption } from './preferences-constants.ts'

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

export default function AccountSettingsRoute() {
	return <Preferences />
}
