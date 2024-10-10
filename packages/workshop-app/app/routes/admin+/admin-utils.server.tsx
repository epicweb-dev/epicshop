import inspector from 'node:inspector'
import path from 'node:path'
import { workshopRoot } from '@epic-web/workshop-utils/apps.server'
import { deleteCache } from '@epic-web/workshop-utils/cache.server'
import { deleteDb } from '@epic-web/workshop-utils/db.server'
import fsExtra from 'fs-extra'

export async function clearData() {
	if (ENV.EPICSHOP_DEPLOYED) return
	await clearCaches()
	await deleteDb()
}

export async function clearCaches() {
	if (ENV.EPICSHOP_DEPLOYED) return
	await fsExtra.remove(path.join(workshopRoot, 'node_modules', '.cache'))
	await deleteCache()
}

export async function startInspector() {
	if (ENV.EPICSHOP_DEPLOYED) return
	if (!global.__inspector_open__) {
		global.__inspector_open__ = true
		inspector.open()
	} else {
		console.info(`Inspector already running.`)
	}
}

export async function stopInspector() {
	if (ENV.EPICSHOP_DEPLOYED) return
	if (global.__inspector_open__) {
		global.__inspector_open__ = false
		inspector.close()
	} else {
		console.info(`Inspector already stopped.`)
	}
}
