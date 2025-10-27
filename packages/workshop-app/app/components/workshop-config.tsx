import { invariant } from '@epic-web/invariant'
import { useRootLoaderData } from '#app/utils/root-loader.ts'

export function useWorkshopConfig() {
	const data = useRootLoaderData()
	invariant(data.workshopConfig, 'useWorkshopConfig requires a workshopConfig.')
	return data.workshopConfig
}
