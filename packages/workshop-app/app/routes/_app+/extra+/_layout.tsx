import { getApps, isExtraApp } from '@epic-web/workshop-utils/apps.server'
import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { Outlet } from 'react-router'
import { serverOnly$ } from 'vite-env-only/macros'

export const handle: SEOHandle = {
	getSitemapEntries: serverOnly$(async (request) => {
		const apps = await getApps({ request })
		const extras = apps.filter(isExtraApp).sort((a, b) =>
			a.title.localeCompare(b.title, undefined, {
				numeric: true,
				sensitivity: 'base',
			}),
		)
		return [
			{ route: '/extra' },
			...extras.map((extra) => ({
				route: `/extra/${extra.dirName}`,
			})),
		]
	}),
}

export default function ExtrasLayout() {
	return (
		<div className="flex h-full grow">
			<Outlet />
		</div>
	)
}
