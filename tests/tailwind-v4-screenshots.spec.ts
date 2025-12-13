import { expect, test } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'

const phase = process.env.SCREENSHOT_PHASE ?? 'before'

async function ensureOnboardingComplete(page: any) {
	// The root loader redirects to /onboarding until tour videos are marked watched.
	// We can safely mark them watched without playing the videos.
	await page.waitForLoadState('domcontentloaded')
	const onboardingHeading = page.getByRole('heading', { name: /^onboarding$/i })
	if (!(await onboardingHeading.isVisible().catch(() => false))) return

	// Keep marking unwatched videos until none remain.
	for (let i = 0; i < 10; i++) {
		const markButtons = page.getByRole('button', { name: /^mark as watched$/i })
		if ((await markButtons.count()) === 0) break
		await markButtons.first().click()
		await page.waitForURL(/\/onboarding/i)
		await page.waitForLoadState('networkidle')
	}

	// Proceed into the app (may go to /login if not authenticated).
	const continueLink = page.getByRole('link', { name: /i've watched.*let's go/i })
	if (await continueLink.isVisible().catch(() => false)) {
		await continueLink.click()
		await page.waitForLoadState('networkidle')
	}
}

async function ensureDir() {
	// This path is intentionally in-repo so we can diff before/after.
	const dir = path.join(process.cwd(), 'tests', 'tailwind-v4-screenshots', phase)
	await fs.mkdir(dir, { recursive: true })
	return dir
}

async function capture(page: any, fileName: string) {
	const dir = await ensureDir()
	await page.waitForTimeout(250)
	await page.screenshot({ path: path.join(dir, fileName), fullPage: true })
}

async function openNavMenu(page: any) {
	const toggle = page.getByRole('button', { name: /open navigation menu/i })
	await toggle.click()
	await expect(page.getByRole('link', { name: /^home$/i })).toBeVisible()
}

async function closeNavMenuIfOpen(page: any) {
	const homeLink = page.getByRole('link', { name: /^home$/i })
	if (await homeLink.isVisible().catch(() => false)) {
		await page.getByRole('button', { name: /open navigation menu/i }).click()
	}
}

test.describe('tailwind v4 upgrade screenshots', () => {
	test('captures key routes', async ({ page }) => {
		test.setTimeout(120_000)

		// Desktop navigation + exercise step + tabs
		await page.setViewportSize({ width: 1280, height: 720 })
		await page.goto('/', { waitUntil: 'networkidle' })
		await ensureOnboardingComplete(page)
		// Ensure we're on a stable app page after completing onboarding.
		await page.goto('/', { waitUntil: 'networkidle' })

		await openNavMenu(page)
		await capture(page, '01-nav-desktop-open.png')

		// Navigate to the first exercise step by clicking through the nav menu.
		const nav = page
			.getByRole('navigation')
			.filter({
				has: page.getByRole('button', { name: /open navigation menu/i }),
			})
			.first()

		await nav.locator('a[href^="/exercise/"]').first().click()
		await page.waitForLoadState('networkidle')

		// With an active exercise, the menu contains links like "01. Some step title".
		await openNavMenu(page)
		await nav.getByRole('link', { name: /^\d{2}\.\s/ }).first().click()
		await page.waitForLoadState('networkidle')

		// Close the menu so the step page layout is visible.
		await closeNavMenuIfOpen(page)
		await capture(page, '02-exercise-step-desktop.png')

		const tabs = ['playground', 'problem', 'solution', 'tests', 'diff', 'chat'] as const
		for (const tab of tabs) {
			const tabLink = page.locator(`#${tab}-tab`)
			if (!(await tabLink.isVisible().catch(() => false))) continue
			await tabLink.click()
			await page.waitForLoadState('networkidle')
			await capture(page, `03-exercise-step-tab-${tab}-desktop.png`)
		}

		// Mobile navigation (open)
		await page.setViewportSize({ width: 390, height: 844 })
		await page.goto('/', { waitUntil: 'networkidle' })
		await openNavMenu(page)
		await capture(page, '04-nav-mobile-open.png')

		expect(true).toBe(true)
	})
})
