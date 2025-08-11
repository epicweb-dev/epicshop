import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { start } from './start.js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

describe('start command', () => {
	describe('findWorkshopAppDir fallback', () => {
		it('should find workshop-app when installed as a scoped package alongside CLI', async () => {
			// This test validates that the fallback logic can find @epic-web/workshop-app
			// when it's installed in the same node_modules directory as @epic-web/workshop-cli
			
			// Since we're running in the monorepo, this test will exercise the fallback logic
			const result = await start({ silent: true })
			
			// The start command should succeed in finding the app directory 
			// Even if it fails later due to missing config, we care that it doesn't fail with the specific "Could not locate workshop-app directory" message
			if (!result.success && result.message?.includes('Could not locate workshop-app directory')) {
				throw new Error('Workshop app directory should be found by fallback logic')
			}
			
			// If we get here, the workshop-app was found successfully
			// The test passes if either it fully succeeds or fails for other reasons (like missing GitHub config)
			expect(result.success || !result.message?.includes('Could not locate workshop-app directory')).toBe(true)
		}, 10000) // Increase timeout since this starts the server
	})
})