import { useCallback, useEffect, useRef, useState } from 'react'
import { useInterval } from './misc.tsx'
import { useIsOnline } from './online.ts'

const healthcheckPath = '/resources/healthcheck'
const healthcheckIntervalMs = 15000

export function useServerStatus() {
	const isOnline = useIsOnline()
	const [isServerDown, setIsServerDown] = useState(false)
	const isCancelledRef = useRef(false)
	const isOnlineRef = useRef(isOnline)

	useEffect(() => {
		isOnlineRef.current = isOnline
	}, [isOnline])

	useEffect(() => {
		isCancelledRef.current = false
		return () => {
			isCancelledRef.current = true
		}
	}, [])

	useEffect(() => {
		if (ENV.EPICSHOP_DEPLOYED) {
			setIsServerDown(false)
			return
		}
		if (!isOnline) {
			setIsServerDown(false)
			return
		}
	}, [isOnline])

	const checkHealth = useCallback(async () => {
		if (ENV.EPICSHOP_DEPLOYED || !isOnline) {
			return
		}
		try {
			const response = await fetch(healthcheckPath, {
				cache: 'no-store',
				headers: { 'x-healthcheck': 'true' },
			})
			if (!isCancelledRef.current && isOnlineRef.current) {
				setIsServerDown(!response.ok)
			}
		} catch {
			if (!isCancelledRef.current && isOnlineRef.current) {
				setIsServerDown(true)
			}
		}
	}, [isOnline])

	useEffect(() => {
		if (ENV.EPICSHOP_DEPLOYED || !isOnline) return
		void checkHealth()
	}, [checkHealth, isOnline])

	useInterval(
		() => {
			void checkHealth()
		},
		ENV.EPICSHOP_DEPLOYED || !isOnline ? null : healthcheckIntervalMs,
	)

	return { isServerDown }
}
