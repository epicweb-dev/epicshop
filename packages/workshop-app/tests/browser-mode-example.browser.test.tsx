import { useState, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { page } from 'vitest/browser'
import { afterEach, expect, test } from 'vitest'

let root: Root | null = null
let container: HTMLDivElement | null = null

function render(ui: ReactElement) {
	container = document.createElement('div')
	document.body.append(container)
	root = createRoot(container)
	root.render(ui)
}

afterEach(() => {
	root?.unmount()
	container?.remove()
	root = null
	container = null
})

function ToggleStatus() {
	const [enabled, setEnabled] = useState(false)

	return (
		<div>
			<p role="status">{enabled ? 'Enabled' : 'Disabled'}</p>
			<button type="button" onClick={() => setEnabled((value) => !value)}>
				Toggle status
			</button>
		</div>
	)
}

test('toggles status in browser mode', async () => {
	render(<ToggleStatus />)

	await expect.element(page.getByText('Disabled')).toBeVisible()
	await page.getByRole('button', { name: 'Toggle status' }).click()
	await expect.element(page.getByText('Enabled')).toBeVisible()
})
