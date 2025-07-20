import type { FullConfig } from '@playwright/test'

async function globalTeardown(config: FullConfig) {
	console.log('🧹 Starting global test teardown...')

	try {
		// Perform any necessary cleanup
		// For example, clean up test artifacts, reset databases, etc.

		// Clean up any lingering processes or connections
		await new Promise((resolve) => setTimeout(resolve, 1000))

		console.log('✅ Global teardown completed successfully')
	} catch (error) {
		console.error('❌ Global teardown failed:', error)
		// Don't throw here as it might mask test failures
	}
}

export default globalTeardown
