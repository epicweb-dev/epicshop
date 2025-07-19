import { test, expect, vi, beforeEach, afterEach } from 'vitest'
import { warm, type WarmResult } from './warm.js'

// Mock console methods to clean up test output
beforeEach(() => {
	vi.spyOn(console, 'log').mockImplementation(() => {})
	vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
	vi.restoreAllMocks()
})

test('warm should return a result with correct structure', async () => {
	const result = await warm({ silent: true })

	expect(result).toHaveProperty('success')
	expect(result).toHaveProperty('message')
	expect(typeof result.success).toBe('boolean')
	expect(typeof result.message).toBe('string')
})

test('warm should accept silent parameter', async () => {
	// Test with silent: true
	const result1 = await warm({ silent: true })
	expect(result1).toHaveProperty('success')
	expect(result1).toHaveProperty('message')

	// Test with silent: false
	const result2 = await warm({ silent: false })
	expect(result2).toHaveProperty('success')
	expect(result2).toHaveProperty('message')

	// Test with default parameter
	const result3 = await warm()
	expect(result3).toHaveProperty('success')
	expect(result3).toHaveProperty('message')
})

test('WarmResult type should have correct structure', () => {
	const result: WarmResult = {
		success: true,
		message: 'Test message',
	}

	expect(result.success).toBe(true)
	expect(result.message).toBe('Test message')
	expect(result.error).toBeUndefined()
})

test('WarmResult type should handle error case', () => {
	const error = new Error('Test error')
	const result: WarmResult = {
		success: false,
		message: 'Error occurred',
		error,
	}

	expect(result.success).toBe(false)
	expect(result.message).toBe('Error occurred')
	expect(result.error).toBe(error)
})

test('warm function should handle errors gracefully', async () => {
	// This test verifies that the warm function doesn't throw
	// even if the underlying dependencies fail
	const result = await warm({ silent: true })

	// Should always return a result object, even if it's an error
	expect(result).toHaveProperty('success')
	expect(result).toHaveProperty('message')

	// In a test environment, it might fail due to missing workshop files
	// but should still return a proper result structure
	if (!result.success) {
		expect(result.error).toBeInstanceOf(Error)
	}
})
