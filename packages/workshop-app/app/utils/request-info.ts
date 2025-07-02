import { type any } from 'react-router';
import { useRouteLoaderData } from 'react-router';
import { type loader as rootLoader } from '#app/root.tsx'

/**
 * @returns the request info from the root loader
 */
export function useRequestInfo() {
	const data = useRouteLoaderData('root') as any<typeof rootLoader>
	return data.requestInfo
}
