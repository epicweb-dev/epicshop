import inspector from 'node:inspector'
import path from 'node:path'
import { getWorkshopRoot } from '@epic-web/workshop-utils/apps.server'
import { deleteCache } from '@epic-web/workshop-utils/cache.server'
import { deleteDb } from '@epic-web/workshop-utils/db.server'
import {
	getSidecarLogs,
	restartSidecarProcess,
} from '@epic-web/workshop-utils/process-manager.server'
import fsExtra from 'fs-extra'

export function isInspectorRunning(): boolean {
	try {
		return inspector.url() !== undefined
	} catch {
		return false
	}
}

export async function restartSidecar(name: string): Promise<boolean> {
	if (ENV.EPICSHOP_DEPLOYED) return false
	return restartSidecarProcess(name)
}

export function getSidecarLogLines(
	name: string,
	lineCount: number = 50,
): string {
	if (ENV.EPICSHOP_DEPLOYED) return ''
	return getSidecarLogs(name, lineCount)
}

export async function clearData() {
	if (ENV.EPICSHOP_DEPLOYED) return
	await clearCaches()
	await deleteDb()
}

export async function clearCaches() {
	if (ENV.EPICSHOP_DEPLOYED) return
	await fsExtra.remove(path.join(getWorkshopRoot(), 'node_modules', '.cache'))
	await deleteCache()
}

export async function startInspector() {
	if (ENV.EPICSHOP_DEPLOYED) return
	if (!isInspectorRunning()) {
		inspector.open()
	} else {
		console.info(`Inspector already running.`)
	}
}

export async function stopInspector() {
	if (ENV.EPICSHOP_DEPLOYED) return
	if (isInspectorRunning()) {
		inspector.close()
	} else {
		console.info(`Inspector already stopped.`)
	}
}
