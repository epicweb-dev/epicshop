import path from 'node:path'
import { fileURLToPath } from 'node:url'
import chokidar from 'chokidar'
import { $ } from 'execa'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const here = (...p) => path.join(__dirname, ...p)

const workshopRoot = here('..')

// Watch the exercises directory
const watcher = chokidar.watch(path.join(workshopRoot, 'exercises'), {
	ignored: [
		/(^|[\/\\])\../, // ignore dotfiles
		(path) => {
			// Only watch directories up to depth 2
			const relativePath = path.slice(workshopRoot.length + 1)
			return relativePath.split('/').length > 4
		},
	],
	persistent: true,
	ignoreInitial: true,
})

const debouncedRun = debounce(run, 200)

// Add event listeners.
watcher
	.on('addDir', (path) => {
		debouncedRun()
	})
	.on('unlinkDir', (path) => {
		debouncedRun()
	})
	.on('error', (error) => console.log(`Watcher error: ${error}`))

/**
 * Simple debounce implementation
 */
function debounce(fn, delay) {
	let timer = null
	return (...args) => {
		if (timer) clearTimeout(timer)
		timer = setTimeout(() => {
			fn(...args)
		}, delay)
	}
}

let running = false

async function run() {
	if (running) {
		console.log('still running...')
		return
	}
	running = true
	try {
		await $({
			stdio: 'inherit',
			cwd: workshopRoot,
		})`node ./epicshop/fix.js`
	} catch (error) {
		throw error
	} finally {
		running = false
	}
}

console.log('Watching exercises directory for changes...')
console.log('running fix to start...')
run()
