import { generateSitemap } from '@nasa-gcn/remix-seo'
import {
	type LoaderFunctionArgs,
	type unstable_RSCRouteConfigEntry,
} from 'react-router'
import routes from 'virtual:react-router/unstable_rsc/routes'
import { getDomainUrl } from '#app/utils/misc.tsx'

type SitemapRoutes = Parameters<typeof generateSitemap>[1]

function buildSitemapRoutes(
	entries: Array<unstable_RSCRouteConfigEntry>,
	parentId?: string,
	manifest: SitemapRoutes = {},
) {
	for (const entry of entries) {
		const hasDefault = Boolean(entry.Component || entry.lazy)
		const module = {
			...(entry.handle ? { handle: entry.handle } : {}),
			...(hasDefault ? { default: entry.Component ?? (() => null) } : {}),
		}
		manifest[entry.id] = {
			id: entry.id,
			parentId,
			path: entry.path,
			index: 'index' in entry ? entry.index : undefined,
			module,
		} as SitemapRoutes[string]
		if ('children' in entry && entry.children) {
			buildSitemapRoutes(entry.children, entry.id, manifest)
		}
	}
	return manifest
}

export async function loader({ request }: LoaderFunctionArgs) {
	const sitemapRoutes = buildSitemapRoutes(routes)
	return generateSitemap(request, sitemapRoutes, {
		siteUrl: getDomainUrl(request),
		headers: {
			'Cache-Control': `public, max-age=${60 * 5}`,
		},
	})
}
