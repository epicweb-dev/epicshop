import { getVideoDownloadProgress } from '@epic-web/workshop-utils/offline-videos.server'
import { data, type LoaderFunctionArgs } from 'react-router'
import { ensureUndeployed } from '#app/utils/misc.tsx'

export async function loader({ params }: LoaderFunctionArgs) {
	ensureUndeployed()
	const { playbackId } = params

	if (!playbackId) {
		return data({ progress: null }, { status: 400 })
	}

	const progress = getVideoDownloadProgress(playbackId)
	return data({ progress })
}
