import './init-env.ts'

import { z } from 'zod'
import { cachified, connectionCache } from './cache.server.ts'
import { logger } from './logger.ts'
import { type Timings } from './timing.server.ts'

export { dayjs } from './utils.ts'

const connectionLog = logger('epic:connection')

async function probeOnce(
	url: string,
	expectedOk: (status: number) => boolean = (s) => s >= 200 && s < 300,
	init?: RequestInit,
): Promise<boolean> {
	const signal = AbortSignal.timeout(10_000)
	const start = Date.now()
	connectionLog(`probing ${url}`)
	const res = await fetch(url, {
		method: 'HEAD',
		cache: 'no-store',
		signal,
		...init,
	})
	connectionLog(
		`probe to ${url} returned ${res.status} in ${Date.now() - start}ms`,
	)
	return expectedOk(res.status)
}

async function raceConnectivity(): Promise<boolean> {
	// we have multiple just in case some VPN blocks one or another
	const candidates: Array<Promise<boolean>> = [
		probeOnce('https://connected.kentcdodds.workers.dev'),

		// Non-CF options (different providers / networks):
		probeOnce('https://www.gstatic.com/generate_204', (s) => s === 204),
		probeOnce(
			'http://www.msftconnecttest.com/connecttest.txt',
			(s) => s === 200,
		),
	]

	// Use Promise.any to succeed on first truthy result; treat rejections/non-2xx as false
	const wrapped = candidates.map((p) =>
		p.then((ok) => (ok ? true : Promise.reject(new Error('not ok')))),
	)

	try {
		await Promise.any(wrapped)
		return true
	} catch {
		return false
	}
}

export async function checkConnection({
	request,
	timings,
}: {
	request?: Request
	timings?: Timings
} = {}) {
	connectionLog('calling cachified to check connection')
	const isOnline = await cachified({
		cache: connectionCache,
		request,
		timings,
		key: 'connected',
		ttl: 1000 * 10,
		checkValue: z.boolean(),
		async getFreshValue(context) {
			connectionLog('getting fresh connection value')
			const isOnline = await raceConnectivity()
			if (isOnline) {
				context.metadata.ttl = 1000 * 60
				context.metadata.swr = 1000 * 60 * 30
				return true
			} else {
				return false
			}
		},
	})
	connectionLog(
		`connection check says we are ${isOnline ? 'online' : 'offline'}`,
	)
	return isOnline
}
