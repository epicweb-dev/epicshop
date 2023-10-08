import inspector from 'node:inspector'
import path from 'node:path'
import fsExtra from 'fs-extra'
import { deleteDb } from '#app/utils/db.server.ts'
import { getWorkshopRoot } from '#utils/apps.server.ts'
import { deleteCache } from '#utils/cache.server.ts'
export { inspector }

export async function clearData() {
	if (ENV.KCDSHOP_DEPLOYED) return
	const workshopRoot = getWorkshopRoot()
	await fsExtra.remove(path.join(workshopRoot, 'node_modules', '.cache'))
	await deleteCache()
	await deleteDb()
}
