import { getApps, isExampleApp } from '@epic-web/workshop-utils/apps.server'
import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { Outlet } from 'react-router'
import { serverOnly$ } from 'vite-env-only/macros'

export const handle: SEOHandle = {
	getSitemapEntries: serverOnly$(async (request) => {
		const apps = await getApps({ request })
		const examples = apps.filter(isExampleApp).sort((a, b) =>
			a.title.localeCompare(b.title, undefined, {
				numeric: true,
				sensitivity: 'base',
			}),
		)
		return [
			{ route: '/examples' },
			...examples.map((example) => ({
				route: `/examples/${example.dirName}`,
			})),
		]
	}),
}

export default function ExamplesLayout() {
	return (
		<div className="flex h-full grow">
			<Outlet />
		</div>
	)
}
