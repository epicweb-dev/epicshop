import { getAllFileCacheEntries } from '@epic-web/workshop-utils/cache.server'
import { ensureUndeployed } from '#app/utils/misc.js'

export async function loader() {
	ensureUndeployed()
	const entries = await getAllFileCacheEntries()
	return Response.json({ entries })
}
