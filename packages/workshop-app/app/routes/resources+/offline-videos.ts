import {
	deleteOfflineVideo,
	downloadOfflineVideo,
	getOfflineVideoSummary,
} from '@epic-web/workshop-utils/offline-videos.server'
import {
	data,
	type ActionFunctionArgs,
	type LoaderFunctionArgs,
} from 'react-router'
import { ensureUndeployed } from '#app/utils/misc.tsx'

export async function loader({ request }: LoaderFunctionArgs) {
	ensureUndeployed()
	const offlineVideos = await getOfflineVideoSummary({ request })
	return data({ offlineVideos })
}

export async function action({ request }: ActionFunctionArgs) {
	ensureUndeployed()
	const formData = await request.formData()
	const intent = formData.get('intent')
	const playbackId = formData.get('playbackId')

	if (typeof playbackId !== 'string' || playbackId.length === 0) {
		return data(
			{ status: 'error', message: 'Missing playbackId' },
			{ status: 400 },
		)
	}

	if (intent === 'download-video') {
		const title = formData.get('title')
		const url = formData.get('url')
		if (typeof title !== 'string' || typeof url !== 'string') {
			return data(
				{ status: 'error', message: 'Missing title or url' },
				{ status: 400 },
			)
		}
		const result = await downloadOfflineVideo({ playbackId, title, url })
		return data({
			status: result.status,
			action: 'download',
			...(result.status === 'error' && 'message' in result
				? { message: result.message }
				: {}),
		} as const)
	}

	if (intent === 'delete-video') {
		const workshopId = formData.get('workshopId')
		const result = await deleteOfflineVideo(
			playbackId,
			typeof workshopId === 'string' && workshopId.length > 0
				? { workshopId }
				: undefined,
		)
		return data({ status: result.status, action: 'delete' } as const)
	}

	return data({ status: 'error', message: 'Unknown intent' }, { status: 400 })
}
