import { type Route } from './+types/connection-status'
import * as React from 'react'
import { data, useFetcher } from 'react-router'
import { ensureUndeployed } from '#app/utils/misc.tsx'
import { checkConnection } from '@epic-web/workshop-utils/utils.server'

export async function action({ request }: Route.ActionArgs) {
	ensureUndeployed()
	await checkConnection({ request, forceFresh: true })
	return data({ ok: true })
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

		function syncFromNavigator() {
			const online = window.navigator.onLine
			if (lastSyncedRef.current === online) return
			lastSyncedRef.current = online

			latestSubmitRef.current(null, {
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
