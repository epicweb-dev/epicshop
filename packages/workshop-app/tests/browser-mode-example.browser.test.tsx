import { page } from '@vitest/browser/context'
import { render } from 'vitest-browser-react'
import { expect, test } from 'vitest'
import { Button } from '#app/components/button.tsx'

test('renders a pending button in browser mode', async () => {
	render(
		<Button status="pending" varient="primary">
			Save
		</Button>,
	)

	await expect.element(page.getByRole('button', { name: 'Save' })).toBeVisible()
	await expect.element(page.getByText('🌀')).toBeVisible()
})
