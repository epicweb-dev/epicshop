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

	// Avoid flaky interactions with embedded video players by directly posting the
	// same form action used by the UI.
	const videoUrlsFromInputs: Array<string> = await page
		.locator('input[name="videoUrl"]')
		.evaluateAll((els: Array<HTMLInputElement>) =>
			els
				.map((el) => el.value)
				.filter((v): v is string => typeof v === 'string' && v.length > 0),
		)
	const videoUrlsFromLinks: Array<string> = await page
		.locator('a[href^="https://www.epicweb.dev/tips/"]')
		.evaluateAll((els: Array<HTMLAnchorElement>) =>
			els
				.map((el) => el.href)
				.filter((v): v is string => typeof v === 'string' && v.length > 0),
		)

	// Fallback to the known onboarding URLs used by the example workshop config.
	const fallbackUrls = [
		'https://www.epicweb.dev/tips/get-started-with-the-epic-workshop-app',
		'https://www.epicweb.dev/tips/get-started-with-the-epic-workshop-app-for-react',
	]

	const videoUrls = Array.from(
		new Set([...videoUrlsFromInputs, ...videoUrlsFromLinks, ...fallbackUrls]),
	)

	if (videoUrls.length) {
		for (const videoUrl of videoUrls) {
			await page.request.post('/onboarding', {
				form: { intent: 'mark-video', videoUrl },
			})
		}
	}

	await page.goto('/onboarding', { waitUntil: 'networkidle' })

	// Fallback: if something prevented the POST approach, click the remaining
	// "Mark as watched" buttons.
	for (let i = 0; i < 10; i++) {
		const markButtons = page.getByRole('button', { name: /^mark as watched$/i })
		if ((await markButtons.count()) === 0) break
		await markButtons.first().click()
		await page.waitForURL(/\/onboarding/i)
		await page.waitForLoadState('networkidle')
	}

	// Confirm we are fully unblocked.
	await expect(page.getByRole('button', { name: /^mark as watched$/i })).toHaveCount(
		0,
	)

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
	await expect(toggle).toBeVisible({ timeout: 30_000 })
	await toggle.click()
	// The opened menu should contain either "Home" or "Workshop Feedback" links.
	// (Some renders/variants may not immediately include "Home" in the accessible tree.)
	await Promise.race([
		page
			.getByRole('link', { name: /^home$/i })
			.waitFor({ state: 'visible', timeout: 10_000 }),
		page
			.getByRole('link', { name: /workshop feedback/i })
			.waitFor({ state: 'visible', timeout: 10_000 }),
	])
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
		await expect(page).not.toHaveURL(/\/onboarding/i)

		await openNavMenu(page)
		await capture(page, '01-nav-desktop-open.png')

		// Navigate to the first exercise step via the intro page CTA (stable even when
		// the nav menu is collapsed/animated).
		await closeNavMenuIfOpen(page)
		const startLearning = page.getByRole('link', { name: /start learning/i })
		if (await startLearning.isVisible().catch(() => false)) {
			await startLearning.click()
			await page.waitForLoadState('networkidle')
		} else {
			// Fallback: go to a known exercise step URL.
			await page.goto('/exercise/01/01/problem', { waitUntil: 'networkidle' })
		}

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
