import { type App } from '@epic-web/workshop-utils/apps.server'
import { cachified, makeSingletonCache } from '@epic-web/workshop-utils/cache.server'
import {
	isAppRunning,
	isPortAvailable,
} from '@epic-web/workshop-utils/process-manager.server'

// In deployed environments, apps cannot be started, so always return false
const isDeployed =
	process.env.EPICSHOP_DEPLOYED === 'true' ||
	process.env.EPICSHOP_DEPLOYED === '1'

// Cache app running state for 30 seconds to avoid expensive process checks
const appRunningStateCache = makeSingletonCache<{
	isRunning: boolean
	portIsAvailable: boolean | null
}>('AppRunningStateCache')

export async function getAppRunningState(a: App) {
	if (a.dev.type !== 'script') {
		return { isRunning: false, portIsAvailable: null }
	}

	// In deployed environments, apps cannot be started, so always return false
	if (isDeployed) {
		return { isRunning: false, portIsAvailable: null }
	}

	return await cachified({
		key: `app-running-state-${a.name}`,
		cache: appRunningStateCache,
		ttl: 1000 * 30, // 30 seconds
		async getFreshValue() {
			const isRunning = await isAppRunning(a)
			const portIsAvailable = isRunning
				? null
				: await isPortAvailable(a.dev.portNumber)
			return { isRunning, portIsAvailable }
		},
	})
}
