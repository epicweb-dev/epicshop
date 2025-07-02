import { useRouteLoaderData } from 'react-router'
import { type RootLoaderData } from '#app/root.tsx'

export function useApps() {
	const data = useRouteLoaderData('root') as RootLoaderData
	if (!data) {
		throw new Error('useApps requires a data object from the root loader')
	}
	return data.apps
}
