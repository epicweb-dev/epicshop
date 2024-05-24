import { expect, test } from '@playwright/test'

test('smoke test', async ({ page }) => {
	await page.goto('/')
	expect(true).toBe(true)
})
