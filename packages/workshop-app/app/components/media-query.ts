import { useSyncExternalStore } from 'react'

export function makeMediaQueryStore(
	mediaQuery: string,
	serverSnapshot: boolean,
) {
	function getSnapshot() {
		return window.matchMedia(mediaQuery).matches
	}

	function subscribe(callback: () => void) {
		const mediaQueryList = window.matchMedia(mediaQuery)
		mediaQueryList.addEventListener('change', callback)
		return () => {
			mediaQueryList.removeEventListener('change', callback)
		}
	}

	return function useMediaQuery() {
		return useSyncExternalStore(subscribe, getSnapshot, () => serverSnapshot)
	}
}
