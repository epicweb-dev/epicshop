import { useSyncExternalStore } from 'react'
import { useRequestInfo } from './root-loader.ts'

function getSnapshot() {
	return window.navigator.onLine
}

function subscribe(callback: () => void) {
	window.addEventListener('online', callback)
	window.addEventListener('offline', callback)
	return () => {
		window.removeEventListener('online', callback)
		window.removeEventListener('offline', callback)
	}
}

export function useIsOnline() {
	const requestInfo = useRequestInfo()
	return useSyncExternalStore(subscribe, getSnapshot, () => requestInfo.online)
}
