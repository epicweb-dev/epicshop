import { cachified, connectionCache } from './cache.server.js'
import { type Timings } from './timing.server.js'

export async function checkConnection() {
	try {
		const response = await fetch('https://www.cloudflare.com', {
			method: 'HEAD',
		})
		return response.ok
	} catch {
		return false
	}
}

export async function checkConnectionCached({
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
			const result = await checkConnection()
			if (result) {
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
