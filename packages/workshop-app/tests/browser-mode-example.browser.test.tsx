import { cleanup, render } from '@testing-library/react'
import { page } from 'vitest/browser'
import { afterEach, expect, test } from 'vitest'
import { Button } from '#app/components/button.tsx'

afterEach(() => {
	cleanup()
})

test('renders a pending button in browser mode', async () => {
	render(
		<Button status="pending" varient="primary">
			Save
		</Button>,
	)

	await expect.element(page.getByRole('button', { name: 'Save' })).toBeVisible()
	await expect.element(page.getByText('🌀')).toBeVisible()
})
