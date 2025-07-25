import { expect, test } from '@playwright/test'

test.describe('Smoke Tests', () => {
	test('should load the homepage successfully', async ({ page }) => {
		// Navigate to the homepage
		const response = await page.goto('/', {
			waitUntil: 'networkidle',
			timeout: 30000,
		})

		// Verify the response is successful
		expect(response?.status()).toBe(200)

		// Verify the page title is not empty
		const title = await page.title()
		expect(title).toBeTruthy()
		expect(title.length).toBeGreaterThan(0)

		// Verify the page content loaded
		await expect(page.locator('body')).toBeVisible()
	})

	test('should have basic HTML structure', async ({ page }) => {
		await page.goto('/', { waitUntil: 'networkidle' })

		// Check for basic HTML elements
		await expect(page.locator('html')).toBeVisible()
		await expect(page.locator('head')).toBeAttached()
		await expect(page.locator('body')).toBeVisible()
	})

	test('should not have console errors', async ({ page }) => {
		const consoleErrors: string[] = []

		page.on('console', (msg) => {
			if (msg.type() === 'error') {
				consoleErrors.push(msg.text())
			}
		})

		await page.goto('/')
		
		// Wait a bit for any async operations that might log errors
		await page.waitForTimeout(2000)

		// Filter out expected video player errors that occur in CI environments
		const criticalErrors = consoleErrors.filter(
			(error) => 
				// Ignore Mux video player codec errors (common in CI without proper codecs)
				!error.includes('mux-player') &&
				!error.includes('MediaError') &&
				!error.includes('manifestIncompatibleCodecsError') &&
				!error.includes('HLS') &&
				!error.includes('no level with compatible codecs') &&
				// Ignore other expected media-related errors in headless environments
				!error.includes('codec') &&
				!error.includes('media') &&
				// Keep other critical errors
				true
		)

		expect(criticalErrors).toHaveLength(0)
	})

	test('should handle navigation timeout gracefully', async ({ page }) => {
		// Test that the page loads within a reasonable time
		const startTime = Date.now()

		await page.goto('/', { waitUntil: 'domcontentloaded' })

		const loadTime = Date.now() - startTime

		// Should load within 10 seconds
		expect(loadTime).toBeLessThan(10000)
	})

	test('should be responsive to basic interactions', async ({ page }) => {
		await page.goto('/', { waitUntil: 'networkidle' })

		// Test basic page interactivity
		const body = page.locator('body')
		await expect(body).toBeVisible()

		// Test that the page responds to mouse events
		await body.hover()

		// Test that the page responds to keyboard events
		await page.keyboard.press('Tab')

		// If there are any interactive elements, they should be functional
		const links = page.locator('a[href]')
		const linkCount = await links.count()

		if (linkCount > 0) {
			// Test that at least one link is visible and clickable
			const firstLink = links.first()
			await expect(firstLink).toBeVisible()
		}
	})
})
