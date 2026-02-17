import { commandPaletteController } from './command-palette'
import { registerDefaultCommands } from './command-palette-default-commands'

let cleanup: (() => void) | null = null

export function isCommandPaletteHotkey(event: KeyboardEvent) {
	const key = event.key.toLowerCase()
	const isP = key === 'p'
	if (!isP || !event.shiftKey) return false

	// macOS: Cmd+Shift+P
	if (event.metaKey) return true
	// Windows/Linux: Ctrl+Shift+P (nice-to-have)
	if (event.ctrlKey) return true

	return false
}

export function init() {
	if (cleanup) return cleanup

	const unregisterDefaults = registerDefaultCommands(commandPaletteController)

	function handleKeyDown(event: KeyboardEvent) {
		if (event.defaultPrevented) return
		if (event.repeat) return
		if (!isCommandPaletteHotkey(event)) return

		// If the palette is already open, do *nothing* (and do not preventDefault)
		// so the browser/OS can still handle this shortcut if it wants to.
		if (commandPaletteController.isOpen()) return

		event.preventDefault()
		commandPaletteController.open()
	}

	document.addEventListener('keydown', handleKeyDown)

	cleanup = () => {
		document.removeEventListener('keydown', handleKeyDown)
		unregisterDefaults()
		cleanup = null
	}

	return cleanup
}

