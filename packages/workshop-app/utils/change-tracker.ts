import chokidar from 'chokidar'
import closeWithGrace from 'close-with-grace'

declare global {
	var __change_tracker_watcher__: ReturnType<typeof getWatcher>
}

export const watcher = (global.__change_tracker_watcher__ =
	global.__change_tracker_watcher__ ?? getWatcher())

function getWatcher() {
	const workshopRoot = process.env.KCDSHOP_CONTEXT_CWD ?? process.cwd()
	const watcher = chokidar.watch(workshopRoot, {
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

closeWithGrace(() => watcher.close())
