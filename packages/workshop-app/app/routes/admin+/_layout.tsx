import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { Link, Outlet } from 'react-router'
import { getRootMatchLoaderData } from '#app/utils/root-loader.ts'
import { type Route } from './+types/_layout.tsx'

export const handle: SEOHandle = {
	getSitemapEntries: () => null,
}

export const meta: Route.MetaFunction = ({ matches }) => {
	const rootData = getRootMatchLoaderData(matches)
	return [{ title: `👷 | ${rootData?.workshopTitle}` }]
}

export default function AdminLayout() {
	return (
		<main className="container mx-auto mt-8">
			<h1 className="text-4xl font-bold">Admin</h1>
			<div className="flex flex-col gap-4">
				<nav>
					<ul className="flex gap-3">
						<li>
							<Link className="underline" to="/">
								Home
							</Link>
						</li>
						<li>
							<Link className="underline" to="/admin">
								Admin
							</Link>
						</li>
						<li>
							<Link className="underline" to="/diff">
								Diff Viewer
							</Link>
						</li>
						<li>
							<Link className="underline" to="db">
								Database
							</Link>
						</li>
						<li>
							<Link className="underline" to="cache">
								Cache Management
							</Link>
						</li>
						<li>
							<Link className="underline" to="offline-videos">
								Offline Videos
							</Link>
						</li>
						<li>
							<Link className="underline" to="version">
								Version
							</Link>
						</li>
					</ul>
				</nav>
				<Outlet />
			</div>
		</main>
	)
}
