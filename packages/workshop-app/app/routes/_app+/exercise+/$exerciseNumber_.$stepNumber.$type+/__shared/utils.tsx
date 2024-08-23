import { type App } from '@epic-web/workshop-utils/apps.server'
import {
	isAppRunning,
	isPortAvailable,
} from '@epic-web/workshop-utils/process-manager.server'

export async function getAppRunningState(a: App) {
	if (a.dev.type !== 'script') {
		return { isRunning: false, portIsAvailable: null }
	}
	const isRunning = isAppRunning(a)
	const portIsAvailable = isRunning
		? null
		: await isPortAvailable(a.dev.portNumber)
	return { isRunning, portIsAvailable }
}
