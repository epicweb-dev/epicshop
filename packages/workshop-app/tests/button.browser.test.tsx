import { expect, test } from 'vitest'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { Button } from '#app/components/button.tsx'

test('renders a pending button in browser mode', async () => {
	await render(
		<Button status="pending" varient="primary">
			Save
		</Button>,
	)

	await expect.element(page.getByRole('button', { name: 'Save' })).toBeVisible()
	await expect.element(page.getByText('🌀')).toBeVisible()
})
