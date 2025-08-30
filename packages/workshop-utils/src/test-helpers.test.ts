import { test, expect, describe, vi, beforeEach, afterEach } from 'vitest'
import {
	delay,
	delayedReject,
	waitForCondition,
	withFakeTimers,
	withRealTimers,
	createTestEnvironment,
	createTestError,
	_resetTimerState,
} from './test-helpers.js'

describe('Test Helpers', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		// Ensure we start with real timers
		vi.useRealTimers()
		_resetTimerState()
	})

	afterEach(() => {
		vi.useRealTimers()
		vi.restoreAllMocks()
		_resetTimerState()
	})

	describe('Timer Utilities', () => {
		test('delay should work with real timers', async () => {
			vi.useRealTimers()

			const start = Date.now()
			await delay(50)
			const elapsed = Date.now() - start

			// Allow some tolerance for timing
			expect(elapsed).toBeGreaterThanOrEqual(45)
			expect(elapsed).toBeLessThan(100)
		})

		test('delay should work with fake timers when advanced', async () => {
			vi.useFakeTimers()

			let resolved = false
			const promise = delay(1000).then(() => {
				resolved = true
			})

			// Should not resolve immediately
			expect(resolved).toBe(false)

			// Advance timers and wait for promise resolution
			vi.advanceTimersByTime(1000)
			await vi.runOnlyPendingTimersAsync()
			await promise

			expect(resolved).toBe(true)
		})

		test('delayedReject should work with real timers', async () => {
			vi.useRealTimers()

			const testError = createTestError.generic('Test timeout')

			await expect(delayedReject(50, testError)).rejects.toThrow('Test timeout')
		})

		test('delayedReject should work with fake timers when advanced', async () => {
			vi.useFakeTimers()

			const testError = createTestError.generic('Test timeout')
			let rejected = false

			const promise = delayedReject(1000, testError).catch(() => {
				rejected = true
				throw testError
			})

			// Should not reject immediately
			expect(rejected).toBe(false)

			// Advance timers
			vi.advanceTimersByTime(1000)
			await vi.runOnlyPendingTimersAsync()

			await expect(promise).rejects.toThrow('Test timeout')
			expect(rejected).toBe(true)
		})

		test('withFakeTimers should handle timer-dependent operations', async () => {
			// Start with real timers
			vi.useRealTimers()

			const result = await withFakeTimers(async (advanceTime) => {
				let completed = false

				// Start an async operation
				const operation = delay(1000).then(() => {
					completed = true
					return 'success'
				})

				// Advance time to complete the operation
				await advanceTime(1000)

				const result = await operation
				expect(completed).toBe(true)
				return result
			})

			expect(result).toBe('success')
		})

		test('withRealTimers should temporarily switch to real timers', async () => {
			vi.useFakeTimers()

			const result = await withRealTimers(async () => {
				return 'real-timer-result'
			})

			expect(result).toBe('real-timer-result')
		})

		test('waitForCondition should work with fake timers', async () => {
			let counter = 0
			const condition = () => {
				counter++
				return counter >= 3
			}

			// Use withFakeTimers helper for better control
			await withFakeTimers(async (advanceTime) => {
				// Start the condition check
				const promise = waitForCondition(condition, 1000, 100)

				// Advance timers to allow the condition checks to run
				for (let i = 0; i < 5; i++) {
					await advanceTime(100)
					if (counter >= 3) break
				}

				await promise
			})

			// Should complete without error
			expect(counter).toBeGreaterThanOrEqual(3)
		})
	})

	describe('Test Environment', () => {
		test('createTestEnvironment should provide mock console', () => {
			const env = createTestEnvironment()

			try {
				console.log('test message')
				console.error('test error')
				console.warn('test warning')

				expect(env.console.getLogs()).toEqual(['test message'])
				expect(env.console.getErrors()).toEqual(['test error'])
				expect(env.console.getWarns()).toEqual(['test warning'])
			} finally {
				env.cleanup()
			}
		})

		test('createTestEnvironment should handle fake timers option', () => {
			const envWithFakeTimers = createTestEnvironment({ useFakeTimers: true })
			const envWithRealTimers = createTestEnvironment({ useFakeTimers: false })

			try {
				// Test that the environments were created successfully
				expect(envWithFakeTimers.console).toBeDefined()
				expect(envWithRealTimers.console).toBeDefined()

				// Test that timer methods exist
				expect(typeof envWithFakeTimers.advanceTime).toBe('function')
				expect(typeof envWithRealTimers.advanceTime).toBe('function')
			} finally {
				envWithFakeTimers.cleanup()
				envWithRealTimers.cleanup()
			}
		})
	})

	describe('Error Utilities', () => {
		test('createTestError should create different error types', () => {
			const genericError = createTestError.generic()
			const errorWithCode = createTestError.withCode(
				'Custom message',
				'CUSTOM_CODE',
			)
			const networkError = createTestError.network()

			expect(genericError.message).toBe('Test error')
			expect(errorWithCode.message).toBe('Custom message')
			expect(errorWithCode.code).toBe('CUSTOM_CODE')
			expect(networkError.code).toBe('NETWORK_ERROR')
		})
	})
})
