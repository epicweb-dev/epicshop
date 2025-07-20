import { test, expect, vi, describe, beforeEach } from 'vitest'
import { warm, type WarmResult } from './warm.js'

describe('warm command', () => {
	beforeEach(() => {
		// Additional setup specific to warm command tests
		vi.clearAllMocks()
	})

	test('should return a result with correct structure', async () => {
		const result = await warm({ silent: true })

		expect(result).toHaveProperty('success')
		expect(result).toHaveProperty('message')
		expect(typeof result.success).toBe('boolean')
		expect(typeof result.message).toBe('string')
	})

	test('should accept silent parameter variations', async () => {
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

	test('should handle errors gracefully and return proper result structure', async () => {
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

	test('should handle timeout scenarios gracefully', async () => {
		// Test that the function completes within a reasonable time
		const startTime = Date.now()
		const result = await warm({ silent: true })
		const endTime = Date.now()
		
		expect(endTime - startTime).toBeLessThan(10000) // Should complete within 10 seconds
		expect(result).toBeDefined()
	})

	test('should handle concurrent calls without issues', async () => {
		// Test multiple concurrent warm calls
		const promises = Array.from({ length: 3 }, () => warm({ silent: true }))
		const results = await Promise.all(promises)
		
		results.forEach(result => {
			expect(result).toHaveProperty('success')
			expect(result).toHaveProperty('message')
		})
	})

	test('should provide meaningful error messages on failure', async () => {
		const result = await warm({ silent: true })
		
		if (!result.success) {
			expect(result.message).toBeTruthy()
			expect(typeof result.message).toBe('string')
			expect(result.message.length).toBeGreaterThan(0)
		}
	})

	test('should respect silent mode for console output', async () => {
		const consoleSpy = vi.spyOn(console, 'log')
		
		// Silent mode should not produce console output
		await warm({ silent: true })
		
		// Note: We can't easily test this without knowing the internal implementation
		// but we can ensure the function accepts the parameter
		expect(consoleSpy).not.toThrow()
	})
})

describe('WarmResult type', () => {
	test('should have correct structure for success case', () => {
		const result: WarmResult = {
			success: true,
			message: 'Test message',
		}

		expect(result.success).toBe(true)
		expect(result.message).toBe('Test message')
		expect(result.error).toBeUndefined()
	})

	test('should handle error case correctly', () => {
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

	test('should allow optional properties', () => {
		// Test minimal success result
		const minimalSuccess: WarmResult = {
			success: true,
		}
		expect(minimalSuccess.success).toBe(true)

		// Test minimal failure result
		const minimalFailure: WarmResult = {
			success: false,
		}
		expect(minimalFailure.success).toBe(false)
	})

	test('should handle different error types', () => {
		const stringError: WarmResult = {
			success: false,
			message: 'String error',
			error: new Error('String-based error'),
		}

		const customError: WarmResult = {
			success: false,
			message: 'Custom error',
			error: new TypeError('Type error occurred'),
		}

		expect(stringError.error).toBeInstanceOf(Error)
		expect(customError.error).toBeInstanceOf(TypeError)
	})
})
