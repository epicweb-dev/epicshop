function isBrowser() {
	return typeof window !== 'undefined' && typeof document !== 'undefined'
}

export function clickKeyboardAction(action: string | string[]): boolean {
	if (!isBrowser()) return false
	const actions = Array.isArray(action) ? action : [action]
	const element = actions
		.map((value) => document.querySelector(`[data-keyboard-action="${value}"]`))
		.find((value) => value instanceof HTMLElement)
	if (element instanceof HTMLElement) {
		element.click()
		return true
	}
	return false
}
