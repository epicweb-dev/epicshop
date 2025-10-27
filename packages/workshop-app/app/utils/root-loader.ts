import { invariant } from '@epic-web/invariant'
import { unstable_useRoute as useRoute } from 'react-router'
import { type Route } from '../+types/root.tsx'

/**
 * @returns the loader data from the root loader
 * @throws if the loader data is null
 */
export function useRootLoaderData() {
	const route = useRoute('root')
	invariant(
		route.loaderData,
		`useRootLoaderData: useRoute('root') loaderData returned null. This can happen if there was an error in the root loader. In this case, the error boundary to should render and we cannot use useRootLoaderData.`,
	)
	return route.loaderData
}

/**
 * @returns the request info from the root loader
 */
export function useRequestInfo() {
	const route = useRootLoaderData()
	return route.requestInfo
}

export function useApps() {
	const data = useRootLoaderData()
	return data.apps
}

export function getRootMatchLoaderData(
	matches: Array<{ id: string; loaderData: unknown } | undefined>,
) {
	return matches.find((m) => m?.id === 'root')?.loaderData as
		| Route.ComponentProps['loaderData']
		| undefined
}
