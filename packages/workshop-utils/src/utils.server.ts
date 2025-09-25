import './init-env.js'

import { remember } from '@epic-web/remember'
import dayjsLib from 'dayjs'
import relativeTimePlugin from 'dayjs/plugin/relativeTime.js'
import timeZonePlugin from 'dayjs/plugin/timezone.js'
import utcPlugin from 'dayjs/plugin/utc.js'
import { cachified, connectionCache } from './cache.server.js'
import { type Timings } from './timing.server.js'

export const dayjs = remember('dayjs', () => {
	dayjsLib.extend(utcPlugin)
	dayjsLib.extend(timeZonePlugin)
	dayjsLib.extend(relativeTimePlugin)
	return dayjsLib
})

export async function checkConnection({
	request,
	timings,
}: {
	request?: Request
	timings?: Timings
} = {}) {
	const isOnline = await cachified({
		cache: connectionCache,
		request,
		timings,
		key: 'connected',
		ttl: 1000 * 10,
		async getFreshValue(context) {
			const response = await fetch('https://one.one.one.one/cdn-cgi/trace', {
				// don't try a HEAD request. I guess they don't like HEAD requests...
				method: 'GET',
			})
			if (response.ok) {
				context.metadata.ttl = 1000 * 60
				context.metadata.swr = 1000 * 60 * 30
				return true
			} else {
				return false
			}
		},
	})
	return isOnline
}
