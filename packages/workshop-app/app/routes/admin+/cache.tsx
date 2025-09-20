import { getAllWorkshopCaches } from '@epic-web/workshop-utils/cache.server'
import { getEnv } from '@epic-web/workshop-utils/env.server'
import { href } from 'react-router'
import { ensureUndeployed } from '#app/utils/misc.js'
import { type Route } from './+types/cache.ts'

export async function loader() {
	ensureUndeployed()
	const currentWorkshopId = getEnv().EPICSHOP_WORKSHOP_INSTANCE_ID
	const allWorkshopCaches = await getAllWorkshopCaches()
	return { currentWorkshopId, allWorkshopCaches }
}

export default function CacheManagement({ loaderData }: Route.ComponentProps) {
	return (
		<div>
			<h2>Cache Management</h2>
			<p>Current Workshop ID: {loaderData.currentWorkshopId}</p>
			<h3>All Workshop Caches</h3>
			<ul>
				{loaderData.allWorkshopCaches.map((workshopCache) => (
					<li key={workshopCache.workshopId}>
						{workshopCache.workshopId}
						<ul>
							{workshopCache.caches.map((cache) => (
								<li key={cache.name}>
									{cache.name} ({cache.entries.length} entries)
									<ul>
										{cache.entries.map(({ key, entry, filename }) => (
											<li key={key}>
												{key} -{' '}
												{new Date(entry.metadata.createdTime).toLocaleString()}
												<a
													href={href('/admin/cache/*', {
														'*': `${workshopCache.workshopId}/${cache.name}/${filename}`,
													})}
												>
													[view]
												</a>
											</li>
										))}
									</ul>
								</li>
							))}
						</ul>
					</li>
				))}
			</ul>
		</div>
	)
}
