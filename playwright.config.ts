import { devices, type PlaywrightTestConfig } from '@playwright/test'
import 'dotenv/config'

const PORT = process.env.PORT ?? 5639

/**
 * See https://playwright.dev/docs/test-configuration.
 */
const config: PlaywrightTestConfig = {
	testDir: './tests',
	/* Maximum time one test can run for. */
	timeout: 60 * 1000, // Increased timeout for more reliable tests
	expect: {
		/**
		 * Maximum time expect() should wait for the condition to be met.
		 * For example in `await expect(locator).toHaveText();`
		 */
		timeout: 10000, // Increased expect timeout
	},
	/* Run tests in files in parallel */
	fullyParallel: true,
	/* Fail the build on CI if you accidentally left test.only in the source code. */
	forbidOnly: !!process.env.CI,
	/* Retry on CI only */
	retries: process.env.CI ? 3 : 1, // More retries for reliability
	/* Opt out of parallel tests on CI. */
	workers: process.env.CI ? 2 : undefined, // Increased workers for CI
	/* Reporter to use. See https://playwright.dev/docs/test-reporters */
	reporter: [
		['html', { open: 'never' }],
		['json', { outputFile: 'test-results/results.json' }],
		process.env.CI ? ['github'] : ['list'],
	],
	/* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
	use: {
		/* Maximum time each action such as `click()` can take. Defaults to 0 (no limit). */
		actionTimeout: 15000, // Increased action timeout
		/* Base URL to use in actions like `await page.goto('/')`. */
		baseURL: `http://localhost:${PORT}/`,

		/* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
		trace: 'retain-on-failure',
		/* Take screenshot on failure */
		screenshot: 'only-on-failure',
		/* Capture video on failure */
		video: 'retain-on-failure',
		/* Navigation timeout */
		navigationTimeout: 30000,
	},

	/* Configure projects for major browsers */
	projects: [
		{
			name: 'chromium',
			use: {
				...devices['Desktop Chrome'],
				// Add extra viewport for more reliable testing
				viewport: { width: 1280, height: 720 },
			},
		},
		// Add Firefox for cross-browser testing (optional, can be enabled as needed)
		// {
		// 	name: 'firefox',
		// 	use: { ...devices['Desktop Firefox'] },
		// },
	],

	/* Folder for test artifacts such as screenshots, videos, traces, etc. */
	outputDir: 'test-results/',

	/* Run your local dev server before starting the tests */
	webServer: {
		command: process.env.CI
			? `npx cross-env PORT=${PORT} npm run start --workspace=@epic-web/workshop-app`
			: `npx cross-env PORT=${PORT} npm run dev --workspace=@epic-web/workshop-app`,
		port: Number(PORT),
		reuseExistingServer: !process.env.CI,
		timeout: 120 * 1000, // Increased server startup timeout
		stdout: 'ignore',
		stderr: 'pipe',
	},

	/* Global setup and teardown */
	globalSetup: './tests/global-setup.ts',
	globalTeardown: './tests/global-teardown.ts',
}

export default config
