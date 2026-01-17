import { createRoot, type Root } from 'react-dom/client'
import { page } from 'vitest/browser'
import { afterEach, expect, test } from 'vitest'
import { Button } from '#app/components/button.tsx'

let root: Root | null = null
let container: HTMLDivElement | null = null

afterEach(() => {
	root?.unmount()
	container?.remove()
	root = null
	container = null
})

test('renders a pending button in browser mode', async () => {
	container = document.createElement('div')
	document.body.insertAdjacentElement('beforeend', container)
	root = createRoot(container)
	root.render(
		<Button status="pending" varient="primary">
			Save
		</Button>,
	)

	await expect.element(page.getByRole('button', { name: 'Save' })).toBeVisible()
	await expect.element(page.getByText('🌀')).toBeVisible()
})
