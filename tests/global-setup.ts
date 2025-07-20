import { chromium, type FullConfig } from '@playwright/test'

async function globalSetup(config: FullConfig) {
	console.log('🚀 Starting global test setup...')
	
	try {
		// Verify that the web server is accessible before running tests
		const browser = await chromium.launch()
		const page = await browser.newPage()
		
		const baseURL = config.projects[0].use.baseURL || 'http://localhost:5639'
		
		// Wait for the server to be ready with retries
		let retries = 0
		const maxRetries = 10
		
		while (retries < maxRetries) {
			try {
				const response = await page.goto(baseURL, {
					timeout: 10000,
					waitUntil: 'networkidle'
				})
				
				if (response && response.ok()) {
					console.log('✅ Web server is ready')
					break
				}
			} catch (error) {
				retries++
				console.log(`⏳ Waiting for server... (attempt ${retries}/${maxRetries})`)
				
				if (retries >= maxRetries) {
					throw new Error(`Web server not ready after ${maxRetries} attempts`)
				}
				
				// Wait 2 seconds before retrying
				await new Promise(resolve => setTimeout(resolve, 2000))
			}
		}
		
		await browser.close()
		console.log('✅ Global setup completed successfully')
	} catch (error) {
		console.error('❌ Global setup failed:', error)
		throw error
	}
}

export default globalSetup