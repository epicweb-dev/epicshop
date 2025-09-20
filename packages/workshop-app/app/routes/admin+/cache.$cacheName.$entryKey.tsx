import { getCacheEntry } from '@epic-web/workshop-utils/cache.server'
import { 
	getServerTimeHeader,
	makeTimings,
} from '@epic-web/workshop-utils/timing.server'
import { data, Link } from 'react-router'
import { Icon } from '#app/components/icons.tsx'
import { ensureUndeployed } from '#app/utils/misc.js'
import { type Route } from './+types/cache.$cacheName.$entryKey.tsx'

export async function loader({ params }: Route.LoaderArgs) {
	const timings = makeTimings('cache entry loader')
	ensureUndeployed()
	
	const cacheName = decodeURIComponent(params.cacheName)
	const entryKey = decodeURIComponent(params.entryKey)
	
	const content = await getCacheEntry(cacheName, entryKey)
	
	if (content === null) {
		throw new Response('Cache entry not found', { status: 404 })
	}
	
	return new Response(JSON.stringify(content, null, 2), {
		headers: {
			'Content-Type': 'application/json',
			'Server-Timing': getServerTimeHeader(timings),
		},
	})
}