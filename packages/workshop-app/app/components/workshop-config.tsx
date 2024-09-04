import { useRouteLoaderData } from '@remix-run/react'
import { type loader as rootLoader } from '#app/root.tsx'

export function useWorkshopConfig() {
	const data = useRouteLoaderData<typeof rootLoader>('root')
	if (!data?.workshopConfig) {
		throw new Error('useWorkshopConfig requires a workshopConfig.')
	}
	return data.workshopConfig
}
