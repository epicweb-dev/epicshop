import { type loader as rootLoader } from '#app/root.tsx'
import { useRouteLoaderData } from '@remix-run/react'

export function useApps() {
	const data = useRouteLoaderData<typeof rootLoader>('root')
	if (!data) {
		throw new Error('useApps requires a data object from the root loader')
	}
	return data.apps
}
