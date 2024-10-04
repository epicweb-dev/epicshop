import path from 'path'
import chokidar from 'chokidar'
import closeWithGrace from 'close-with-grace'
import { workshopRoot } from './config.server.js'

declare global {
	var __change_tracker_watcher__: ReturnType<typeof chokidar.watch> | undefined,
		__change_tracker_close_with_grace_return__: ReturnType<
			typeof closeWithGrace
		>
}

let watcher = global.__change_tracker_watcher__

const dirsToWatch = [
	path.join(workshopRoot, 'playground'),
	path.join(workshopRoot, 'exercises'),
	path.join(workshopRoot, 'examples'),
]

const ignoredDirs = [
	'/.git',
	'/node_modules',
	'/build',
	'/server-build',
	'/public/build',
	'/playwright-report',
	'/dist',
	'/.cache',
]

export function getWatcher() {
	if (
		process.env.EPICSHOP_DEPLOYED ??
		process.env.EPICSHOP_ENABLE_WATCHER !== 'true'
	) {
		return undefined
	}
	if (watcher) return watcher
	watcher = chokidar.watch(dirsToWatch, {
		ignoreInitial: true,
		ignored(path, stat) {
			return stat?.isDirectory()
				? ignoredDirs.some((dir) => path.endsWith(dir))
				: false
		},
	})

	global.__change_tracker_watcher__ = watcher
	return watcher
}

export function getOptionalWatcher() {
	return watcher
}

// NOTE: I tried going the unwatch/add route and it just didn't work. All changes
// were still tracked. This listener nonsense was the only way I could come up with
// to handle changes properly.
let currentWithoutWatcher = null
export async function withoutWatcher<ReturnValue>(
	fn: () => Promise<ReturnValue> | ReturnValue,
) {
	if (!watcher) return fn()

	let thisWithoutWatcher = (currentWithoutWatcher = Symbol('withoutWatcher'))
	const eventNames = watcher.eventNames()
	const eventNamesToListenersMap: Record<
		string,
		ReturnType<typeof watcher.listeners>
	> = {}
	for (const eventName of eventNames) {
		if (typeof eventName === 'string') {
			eventNamesToListenersMap[eventName] = watcher.listeners(eventName)
		}
	}
	watcher.removeAllListeners()

	try {
		const result = await fn()
		return result
	} finally {
		if (currentWithoutWatcher === thisWithoutWatcher) {
			// give it a bit to settle,
			// without this the watcher may notice all changes that happened anyway
			await new Promise((r) => setTimeout(r, 100))

			for (const eventName of eventNames) {
				if (typeof eventName === 'string') {
					const listeners = eventNamesToListenersMap[eventName] || []
					for (const listener of listeners) {
						watcher.on(eventName, listener as any)
					}
				}
			}
		}
	}
}

global.__change_tracker_close_with_grace_return__?.uninstall()
global.__change_tracker_close_with_grace_return__ = closeWithGrace(() =>
	watcher?.close(),
)
