'use strict'
var __assign =
	(this && this.__assign) ||
	function () {
		__assign =
			Object.assign ||
			function (t) {
				for (var s, i = 1, n = arguments.length; i < n; i++) {
					s = arguments[i]
					for (var p in s)
						if (Object.prototype.hasOwnProperty.call(s, p)) t[p] = s[p]
				}
				return t
			}
		return __assign.apply(this, arguments)
	}
var _a
Object.defineProperty(exports, '__esModule', { value: true })
var test_1 = require('@playwright/test')
require('dotenv/config')
var PORT = (_a = process.env.PORT) !== null && _a !== void 0 ? _a : 5639
/**
 * See https://playwright.dev/docs/test-configuration.
 */
var config = {
	testDir: './tests',
	/* Maximum time one test can run for. */
	timeout: 30 * 1000,
	expect: {
		/**
		 * Maximum time expect() should wait for the condition to be met.
		 * For example in `await expect(locator).toHaveText();`
		 */
		timeout: 5000,
	},
	/* Run tests in files in parallel */
	fullyParallel: true,
	/* Fail the build on CI if you accidentally left test.only in the source code. */
	forbidOnly: !!process.env.CI,
	/* Retry on CI only */
	retries: process.env.CI ? 2 : 0,
	/* Opt out of parallel tests on CI. */
	workers: process.env.CI ? 1 : undefined,
	/* Reporter to use. See https://playwright.dev/docs/test-reporters */
	reporter: 'html',
	/* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
	use: {
		/* Maximum time each action such as `click()` can take. Defaults to 0 (no limit). */
		actionTimeout: 0,
		/* Base URL to use in actions like `await page.goto('/')`. */
		baseURL: 'http://localhost:'.concat(PORT, '/'),
		/* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
		trace: 'on-first-retry',
	},
	/* Configure projects for major browsers */
	projects: [
		{
			name: 'chromium',
			use: __assign({}, test_1.devices['Desktop Chrome']),
		},
	],
	/* Folder for test artifacts such as screenshots, videos, traces, etc. */
	// outputDir: 'test-results/',
	/* Run your local dev server before starting the tests */
	webServer: {
		command: process.env.CI
			? 'npx cross-env PORT='.concat(PORT, ' npm run start')
			: 'npx cross-env PORT='.concat(PORT, ' npm run dev'),
		port: Number(PORT),
		reuseExistingServer: true,
	},
}
exports.default = config
