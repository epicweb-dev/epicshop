import { generateSitemap } from '@nasa-gcn/remix-seo'
import { type LoaderFunctionArgs, type ServerBuild } from 'react-router'
import { getDomainUrl } from '#app/utils/misc.tsx'
import { getServerBuildFromContext } from '#app/utils/server-build-context.ts'

export async function loader({ request, context }: LoaderFunctionArgs) {
	const serverBuild = await getServerBuildFromContext(context)
	if (!serverBuild) {
		throw new Response('Server build not available', { status: 500 })
	}
	const resolvedBuild = (await serverBuild) as ServerBuild
	return generateSitemap(request, resolvedBuild.routes, {
		siteUrl: getDomainUrl(request),
		headers: {
			'Cache-Control': `public, max-age=${60 * 5}`,
		},
	})
}
