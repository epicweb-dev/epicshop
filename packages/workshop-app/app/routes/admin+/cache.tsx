import { getAllFileCacheEntries } from '@epic-web/workshop-utils/cache.server'
import { json } from '@remix-run/node'
import { ensureUndeployed } from '#app/utils/misc.js'

export async function loader() {
	ensureUndeployed()
	const entries = await getAllFileCacheEntries()
	return json({ entries })
}
