import { type App } from '@epic-web/workshop-utils/apps.server'
import {
	getTestProcessEntry,
	isAppRunning,
	isPortAvailable,
	isTestRunning,
} from '@epic-web/workshop-utils/process-manager.server'

export async function getAppRunningState(a: App) {
	if (a.dev.type !== 'script') {
		return { isRunning: false, portIsAvailable: null }
	}
	const isRunning = await isAppRunning(a)
	const portIsAvailable = isRunning
		? null
		: await isPortAvailable(a.dev.portNumber)
	return { isRunning, portIsAvailable }
}

export function getTestState(a: App) {
	const testProcess = getTestProcessEntry(a)
	if (!testProcess) {
		return { isTestRunning: false, testExitCode: null }
	}
	return {
		isTestRunning: isTestRunning(a),
		testExitCode: testProcess.exitCode ?? null,
	}
}
