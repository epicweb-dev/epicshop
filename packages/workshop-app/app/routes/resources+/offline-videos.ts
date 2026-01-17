import { getOfflineVideoSummary } from '@epic-web/workshop-utils/offline-videos.server'
import { data, type LoaderFunctionArgs } from 'react-router'
import { ensureUndeployed } from '#app/utils/misc.tsx'

export async function loader({ request }: LoaderFunctionArgs) {
	ensureUndeployed()
	const offlineVideos = await getOfflineVideoSummary({ request })
	return data({ offlineVideos })
}
