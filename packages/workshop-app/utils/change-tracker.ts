import chokidar from 'chokidar'
import closeWithGrace from 'close-with-grace'

declare global {
	var __change_tracker_watcher__: ReturnType<typeof chokidar.watch> | undefined
	var __change_tracker_close_with_grace_return__: ReturnType<
		typeof closeWithGrace
	>
}

let watcher = global.__change_tracker_watcher__

export function getWatcher() {
	if (watcher) return watcher
	const workshopRoot = process.env.KCDSHOP_CONTEXT_CWD ?? process.cwd()
	watcher = chokidar.watch(workshopRoot, {
		ignoreInitial: true,
		ignored: [
			'**/node_modules/**',
			'**/build/**',
			'**/public/build/**',
			'**/playwright-report/**',
		],
	})
	return watcher
}

global.__change_tracker_close_with_grace_return__?.uninstall()
global.__change_tracker_close_with_grace_return__ = closeWithGrace(() =>
	watcher?.close(),
)
