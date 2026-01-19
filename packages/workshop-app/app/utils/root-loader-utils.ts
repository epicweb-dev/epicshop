import { type Route } from '../+types/root.tsx'

export function getRootMatchLoaderData(
	matches: Array<{ id: string; loaderData: unknown } | undefined>,
) {
	return matches.find((m) => m?.id === 'root')?.loaderData as
		| Route.ComponentProps['loaderData']
		| undefined
}
