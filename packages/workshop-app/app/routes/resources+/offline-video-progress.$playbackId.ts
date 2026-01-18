import {
	downloadProgressEmitter,
	DOWNLOAD_PROGRESS_EVENTS,
	type VideoDownloadProgress,
} from '@epic-web/workshop-utils/offline-videos.server'
import { data, type LoaderFunctionArgs } from 'react-router'
import { eventStream } from 'remix-utils/sse/server'
import { ensureUndeployed } from '#app/utils/misc.tsx'

export async function loader({ request, params }: LoaderFunctionArgs) {
	ensureUndeployed()
	const { playbackId } = params

	if (!playbackId) {
		return data({ error: 'Missing playbackId' }, { status: 400 })
	}

	return eventStream(request.signal, function setup(send) {
		function handleProgress(progress: VideoDownloadProgress) {
			// Only send events for the specific playbackId we're watching
			if (progress.playbackId !== playbackId) return

			send({ data: JSON.stringify(progress) })
		}

		downloadProgressEmitter.on(
			DOWNLOAD_PROGRESS_EVENTS.PROGRESS,
			handleProgress,
		)

		return () => {
			downloadProgressEmitter.off(
				DOWNLOAD_PROGRESS_EVENTS.PROGRESS,
				handleProgress,
			)
		}
	})
}
