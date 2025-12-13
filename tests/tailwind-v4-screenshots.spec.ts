import { expect, test } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'

const phase = process.env.SCREENSHOT_PHASE ?? 'before'

async function capture(page: any, route: string, fileName: string) {
	// This path is intentionally in-repo so we can diff before/after.
	const dir = path.join(process.cwd(), 'tests', 'tailwind-v4-screenshots', phase)
	await fs.mkdir(dir, { recursive: true })

	await page.setViewportSize({ width: 1280, height: 720 })
	await page.goto(route, { waitUntil: 'networkidle' })
	await page.waitForTimeout(250)
	await page.screenshot({ path: path.join(dir, fileName), fullPage: true })
}

test.describe('tailwind v4 upgrade screenshots', () => {
	test('captures key routes', async ({ page }) => {
		await capture(page, '/', '01-home.png')
		await capture(page, '/start', '02-start.png')
		await capture(page, '/exercises', '03-exercises.png')

		// If the app redirects to login, we still want a stable screenshot.
		await capture(page, '/login', '04-login.png')

		expect(true).toBe(true)
	})
})
