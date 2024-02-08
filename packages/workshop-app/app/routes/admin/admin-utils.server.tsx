import inspector from 'node:inspector'
import path from 'node:path'
import { getWorkshopRoot } from '@kentcdodds/workshop-utils/apps.server'
import { deleteCache } from '@kentcdodds/workshop-utils/cache.server'
import { deleteDb } from '@kentcdodds/workshop-utils/db.server'
import fsExtra from 'fs-extra'
export { inspector }

export async function clearData() {
	await clearCaches()
	await deleteDb()
}

export async function clearCaches() {
	if (ENV.KCDSHOP_DEPLOYED) return
	const workshopRoot = getWorkshopRoot()
	await fsExtra.remove(path.join(workshopRoot, 'node_modules', '.cache'))
	await deleteCache()
}
