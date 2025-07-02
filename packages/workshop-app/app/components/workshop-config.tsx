import { useRouteLoaderData } from 'react-router'
import { type RootLoaderData } from '#app/root.tsx'

export function useWorkshopConfig() {
	const data = useRouteLoaderData('root') as RootLoaderData
	if (!data?.workshopConfig) {
		throw new Error('useWorkshopConfig requires a workshopConfig.')
	}
	return data.workshopConfig
}
