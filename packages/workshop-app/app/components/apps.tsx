import { useRouteLoaderData } from '@remix-run/react'
import { type loader as rootLoader } from '#app/root.tsx'

export function useApps() {
	const data = useRouteLoaderData<typeof rootLoader>('root')
	if (!data) {
		throw new Error('useApps requires a data object from the root loader')
	}
	return data.apps
}
