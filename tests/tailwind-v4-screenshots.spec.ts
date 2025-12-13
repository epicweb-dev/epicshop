import fs from 'node:fs/promises'
import path from 'node:path'
import { expect, test } from '@playwright/test'

const phase = process.env.SCREENSHOT_PHASE ?? 'before'

async function dismissToasts(page: any) {
	// Toasts can appear on load and intercept pointer events.
	const region = page.getByRole('region', { name: /notifications/i })
	for (let i = 0; i < 20; i++) {
		if (page.isClosed?.() === true) return
		const buttons = region.getByRole('button', { name: /close toast|dismiss/i })
		const count = await buttons.count().catch(() => 0)
		if (!count) break
		await buttons.first().click({ force: true }).catch(() => null)
		await page.waitForTimeout(50).catch(() => null)
	}
}

async function hideToasts(page: any) {
	// Toasts are not part of the UI we want to snapshot and they can block clicks.
	await page.addStyleTag({
		content: `
[aria-label^="Notifications"] { display: none !important; }
[data-sonner-toaster], [data-sonner-toast] { display: none !important; }
`.trim(),
	})
}

async function ensureOnboardingComplete(page: any) {
	// The root loader redirects to /onboarding until tour videos are marked watched.
	// We can safely mark them watched without playing the videos.
	await page.goto('/onboarding', { waitUntil: 'domcontentloaded' })
	await hideToasts(page)
	await dismissToasts(page)

	await expect(page.getByRole('heading', { name: /^onboarding$/i })).toBeVisible({
		timeout: 30_000,
	})

	// Click "Mark as watched" for each onboarding video.
	for (let i = 0; i < 10; i++) {
		const markButtons = page.getByRole('button', { name: /^mark as watched$/i })
		const count = await markButtons.count()
		if (count === 0) break
		await markButtons.first().click()
		await page.waitForLoadState('domcontentloaded')
		await dismissToasts(page)
	}

	// Confirm we are fully unblocked and proceed.
	await expect(
		page.getByRole('button', { name: /^mark as watched$/i }),
	).toHaveCount(0)

	const letsGo = page.getByRole('link', { name: /i've watched.*let's go/i })
	await expect(letsGo).toBeVisible({ timeout: 30_000 })
	await letsGo.click()
	await page.waitForLoadState('domcontentloaded')
	await hideToasts(page)
	await dismissToasts(page)
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

async function isMenuOpen(page: any) {
	return await page
		.evaluate(() => document.cookie.includes('es_menu_open=true'))
		.catch(() => false)
}

async function setMenuOpenServer(page: any, open: boolean) {
	await page.evaluate((value) => {
		document.cookie = `es_menu_open=${value ? 'true' : 'false'}; path=/; SameSite=Lax;`
	}, open)
	await page.reload({ waitUntil: 'domcontentloaded' })
	await hideToasts(page)
	await dismissToasts(page)
}

async function closeNavMenuIfOpen(page: any) {
	if (!(await isMenuOpen(page))) return
	// Clicking can be flaky before hydration; force via cookie + reload.
	await setMenuOpenServer(page, false)
}

test.describe('tailwind v4 upgrade screenshots', () => {
	test('captures key routes', async ({ page }) => {
		test.setTimeout(240_000)

		// First, explicitly complete onboarding (required before nav exists)
		await ensureOnboardingComplete(page)

		// Desktop navigation + exercise step + tabs
		await page.setViewportSize({ width: 1280, height: 720 })
		await page.goto('/', { waitUntil: 'domcontentloaded' })
		await hideToasts(page)
		await dismissToasts(page)
		await expect(page).not.toHaveURL(/\/onboarding/i)

		await setMenuOpenServer(page, true)
		await capture(page, '01-nav-desktop-open.png')

		// Navigate to the first exercise step via the intro page CTA (stable even when
		// the nav menu is collapsed/animated).
		await setMenuOpenServer(page, false)
		const startLearning = page.getByRole('link', { name: /start learning/i })
		if (await startLearning.isVisible().catch(() => false)) {
			await startLearning.click()
			await page.waitForLoadState('domcontentloaded')
		} else {
			// Fallback: go to a known exercise step URL.
			await page.goto('/exercise/01/01/problem', { waitUntil: 'domcontentloaded' })
		}
		await hideToasts(page)
		await dismissToasts(page)

		// Close the menu so the step page layout is visible.
		await closeNavMenuIfOpen(page)
		await capture(page, '02-exercise-step-desktop.png')

		const tabs = ['playground', 'problem', 'solution', 'tests', 'diff', 'chat'] as const
		for (const tab of tabs) {
			const tabLink = page.locator(`#${tab}-tab`)
			if (!(await tabLink.isVisible().catch(() => false))) continue
			await tabLink.click({ force: true })
			await page.waitForLoadState('domcontentloaded')
			await hideToasts(page)
			await capture(page, `03-exercise-step-tab-${tab}-desktop.png`)
		}

		// Mobile navigation (open)
		await page.setViewportSize({ width: 390, height: 844 })
		await page.goto('/', { waitUntil: 'domcontentloaded' })
		await dismissToasts(page)
		await setMenuOpenServer(page, true)
		await capture(page, '04-nav-mobile-open.png')

		expect(true).toBe(true)
	})
})
