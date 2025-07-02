import { useRouteLoaderData } from 'react-router'
import { type RootLoaderData } from '#app/root.tsx'

/**
 * @returns the request info from the root loader
 */
export function useRequestInfo() {
	const data = useRouteLoaderData('root') as RootLoaderData
	return data.requestInfo
}
