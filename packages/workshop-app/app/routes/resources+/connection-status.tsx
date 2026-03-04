import { connectionCache } from '@epic-web/workshop-utils/cache.server'
import * as React from 'react'
import { data, useFetcher, type ActionFunctionArgs } from 'react-router'
import { ensureUndeployed } from '#app/utils/misc.tsx'

const CONNECTION_CACHE_KEY = 'connected'

export async function action({ request }: ActionFunctionArgs) {
	ensureUndeployed()
	const formData = await request.formData()
	const online = formData.get('online') === 'true'

	// Invalidate cached connectivity so the next server-side connectivity check
	// uses a fresh probe.
	await connectionCache.delete(CONNECTION_CACHE_KEY)

	return data({ ok: true, online })
}

export function ConnectionStatusSync() {
	const statusFetcher = useFetcher<typeof action>()
	const lastSyncedRef = React.useRef<boolean | null>(null)
	const latestSubmitRef = React.useRef(statusFetcher.submit)

	React.useEffect(() => {
		latestSubmitRef.current = statusFetcher.submit
	}, [statusFetcher.submit])

	React.useEffect(() => {
		if (typeof window === 'undefined') return

		const syncFromNavigator = () => {
			const online = window.navigator.onLine
			if (lastSyncedRef.current === online) return
			lastSyncedRef.current = online

			const formData = new FormData()
			formData.set('online', String(online))
			latestSubmitRef.current(formData, {
				method: 'post',
				action: '/resources/connection-status',
			})
		}
		syncFromNavigator()

		window.addEventListener('online', syncFromNavigator)
		window.addEventListener('offline', syncFromNavigator)
		return () => {
			window.removeEventListener('online', syncFromNavigator)
			window.removeEventListener('offline', syncFromNavigator)
		}
	}, [])

	return null
}
