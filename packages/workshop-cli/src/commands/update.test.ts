import { test, expect, vi, beforeEach, afterEach } from 'vitest'
import { update } from './update.js'

// Mock console methods to clean up test output
beforeEach(() => {
	vi.spyOn(console, 'log').mockImplementation(() => {})
	vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
	vi.restoreAllMocks()
})

test('update should return failure result when deployed environment', async () => {
	// Set deployed environment
	const originalEnv = process.env.EPICSHOP_DEPLOYED
	process.env.EPICSHOP_DEPLOYED = 'true'

	try {
		const result = await update({ silent: true })

		expect(result).toMatchObject({
			success: false,
			message: 'Updates are not available in deployed environments.',
		})
		expect(result.error).toBeUndefined()
	} finally {
		// Restore original environment
		process.env.EPICSHOP_DEPLOYED = originalEnv
	}
})

test('update should return failure result when deployed environment with 1', async () => {
	// Set deployed environment
	const originalEnv = process.env.EPICSHOP_DEPLOYED
	process.env.EPICSHOP_DEPLOYED = '1'

	try {
		const result = await update({ silent: true })

		expect(result).toMatchObject({
			success: false,
			message: 'Updates are not available in deployed environments.',
		})
		expect(result.error).toBeUndefined()
	} finally {
		// Restore original environment
		process.env.EPICSHOP_DEPLOYED = originalEnv
	}
})

test('update should return success result when no updates are available', async () => {
	// Ensure not in deployed environment
	const originalEnv = process.env.EPICSHOP_DEPLOYED
	delete process.env.EPICSHOP_DEPLOYED

	try {
		const result = await update({ silent: true })

		// Should succeed with "no updates available" message
		expect(result).toMatchObject({
			success: true,
			message: 'No updates available.',
		})
		expect(result.error).toBeUndefined()
	} finally {
		// Restore original environment
		process.env.EPICSHOP_DEPLOYED = originalEnv
	}
})

test('update function should accept silent parameter', async () => {
	// Ensure not in deployed environment
	const originalEnv = process.env.EPICSHOP_DEPLOYED
	delete process.env.EPICSHOP_DEPLOYED

	try {
		// Test with silent: true
		const result1 = await update({ silent: true })
		expect(result1).toHaveProperty('success')
		expect(result1).toHaveProperty('message')

		// Test with silent: false
		const result2 = await update({ silent: false })
		expect(result2).toHaveProperty('success')
		expect(result2).toHaveProperty('message')

		// Test with default parameter
		const result3 = await update()
		expect(result3).toHaveProperty('success')
		expect(result3).toHaveProperty('message')
	} finally {
		// Restore original environment
		process.env.EPICSHOP_DEPLOYED = originalEnv
	}
}, 10000) // 10 second timeout
