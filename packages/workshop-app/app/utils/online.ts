import { useSyncExternalStore } from 'react'
import { useRequestInfo } from './request-info.ts'

function getSnapshot() {
	return window.navigator.onLine
}

function subscribe(callback: () => void) {
	window.addEventListener('online', callback)
	return () => {
		window.removeEventListener('online', callback)
	}
}

export function useIsOnline() {
	const requestInfo = useRequestInfo()
	return useSyncExternalStore(subscribe, getSnapshot, () => requestInfo.online)
}
