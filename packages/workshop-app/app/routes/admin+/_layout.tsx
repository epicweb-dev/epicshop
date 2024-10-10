import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { type LoaderFunction, type MetaFunction } from '@remix-run/node'
import { Link, Outlet } from '@remix-run/react'
import { type loader as rootLoader } from '#app/root.tsx'

export const handle: SEOHandle = {
	getSitemapEntries: () => null,
}

export const meta: MetaFunction<
	LoaderFunction,
	{ root: typeof rootLoader }
> = ({ matches }) => {
	const rootData = matches.find((m) => m.id === 'root')?.data
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
