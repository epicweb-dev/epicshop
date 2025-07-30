import { vi } from 'vitest'

/**
 * Test helper utilities for consistent testing patterns
 */

// Simple timer state tracking
let _fakeTimersEnabled = false

/**
 * Reset timer state tracking (for testing purposes)
 */
export function _resetTimerState() {
	_fakeTimersEnabled = false
}

/**
 * Creates a promise that resolves after a specified delay
 * Useful for testing async operations with controlled timing
 * Compatible with both real and fake timers
 */
export function delay(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms)
	})
}

/**
 * Creates a promise that rejects after a specified delay
 * Useful for testing error handling with timeouts
 * Compatible with both real and fake timers
 */
export function delayedReject(ms: number, error: Error): Promise<never> {
	return new Promise((_, reject) => {
		setTimeout(() => reject(error), ms)
	})
}

/**
 * Waits for a condition to become true with a timeout
 * Useful for testing async state changes
 * Note: When using fake timers, you need to manually advance them
 */
export async function waitForCondition(
	condition: () => boolean | Promise<boolean>,
	timeoutMs = 5000,
	intervalMs = 100,
): Promise<void> {
	const startTime = Date.now()

	while (Date.now() - startTime < timeoutMs) {
		if (await condition()) {
			return
		}
		await delay(intervalMs)
	}

	throw new Error(`Condition not met within ${timeoutMs}ms`)
}

/**
 * Utility for testing operations with fake timers
 * Automatically advances timers and handles async operations
 */
export async function withFakeTimers<T>(
	operation: (advanceTime: (ms: number) => Promise<void>) => Promise<T>,
): Promise<T> {
	const wasUsingRealTimers = !_fakeTimersEnabled

	if (wasUsingRealTimers) {
		vi.useFakeTimers()
		_fakeTimersEnabled = true
	}

	try {
		const advanceTime = async (ms: number): Promise<void> => {
			vi.advanceTimersByTime(ms)
			// Allow promises to resolve
			await vi.runOnlyPendingTimersAsync()
		}

		return await operation(advanceTime)
	} finally {
		if (wasUsingRealTimers) {
			vi.useRealTimers()
			_fakeTimersEnabled = false
		}
	}
}

/**
 * Utility for testing operations that should complete within real time
 * Temporarily switches to real timers for the duration of the operation
 */
export async function withRealTimers<T>(
	operation: () => Promise<T>,
): Promise<T> {
	const wasUsingFakeTimers = _fakeTimersEnabled

	if (wasUsingFakeTimers) {
		vi.useRealTimers()
		_fakeTimersEnabled = false
	}

	try {
		return await operation()
	} finally {
		if (wasUsingFakeTimers) {
			vi.useFakeTimers()
			_fakeTimersEnabled = true
		}
	}
}

/**
 * Creates a mock console that captures output for testing
 */
export function createMockConsole() {
	const logs: string[] = []
	const errors: string[] = []
	const warns: string[] = []

	const mockConsole = {
		log: vi.fn((...args: any[]) => {
			logs.push(args.map(String).join(' '))
		}),
		error: vi.fn((...args: any[]) => {
			errors.push(args.map(String).join(' '))
		}),
		warn: vi.fn((...args: any[]) => {
			warns.push(args.map(String).join(' '))
		}),
		getLogs: () => [...logs],
		getErrors: () => [...errors],
		getWarns: () => [...warns],
		clear: () => {
			logs.length = 0
			errors.length = 0
			warns.length = 0
		},
	}

	return mockConsole
}

/**
 * Creates a test environment with common mocks and utilities
 */
export function createTestEnvironment(
	options: { useFakeTimers?: boolean } = {},
) {
	const { useFakeTimers = true } = options
	const mockConsole = createMockConsole()

	// Mock global console
	vi.spyOn(console, 'log').mockImplementation(mockConsole.log)
	vi.spyOn(console, 'error').mockImplementation(mockConsole.error)
	vi.spyOn(console, 'warn').mockImplementation(mockConsole.warn)

	// Conditionally mock timers
	if (useFakeTimers) {
		vi.useFakeTimers()
		_fakeTimersEnabled = true
	}

	return {
		console: mockConsole,
		cleanup: () => {
			vi.restoreAllMocks()
			if (useFakeTimers) {
				vi.useRealTimers()
				_fakeTimersEnabled = false
			}
			mockConsole.clear()
		},
		advanceTime: (ms: number) => {
			if (_fakeTimersEnabled) {
				vi.advanceTimersByTime(ms)
			} else {
				console.warn('advanceTime called but fake timers are not enabled')
			}
		},
		runAllTimers: () => {
			if (_fakeTimersEnabled) {
				vi.runAllTimers()
			} else {
				console.warn('runAllTimers called but fake timers are not enabled')
			}
		},
		runOnlyPendingTimers: async () => {
			if (_fakeTimersEnabled) {
				await vi.runOnlyPendingTimersAsync()
			} else {
				console.warn(
					'runOnlyPendingTimers called but fake timers are not enabled',
				)
			}
		},
		useFakeTimers: () => {
			vi.useFakeTimers()
			_fakeTimersEnabled = true
		},
		useRealTimers: () => {
			vi.useRealTimers()
			_fakeTimersEnabled = false
		},
		isFakeTimers: () => _fakeTimersEnabled,
	}
}

/**
 * Utility for testing error scenarios
 */
export class TestError extends Error {
	constructor(
		message: string,
		public code?: string,
		public statusCode?: number,
	) {
		super(message)
		this.name = 'TestError'
	}
}

/**
 * Creates various types of test errors for consistent error testing
 */
export const createTestError = {
	generic: (message = 'Test error') => new TestError(message),
	withCode: (message = 'Test error with code', code = 'TEST_ERROR') =>
		new TestError(message, code),
	withStatus: (message = 'Test error with status', statusCode = 500) =>
		new TestError(message, undefined, statusCode),
	network: () => new TestError('Network error', 'NETWORK_ERROR'),
	timeout: () => new TestError('Timeout error', 'TIMEOUT_ERROR'),
	validation: () => new TestError('Validation error', 'VALIDATION_ERROR'),
}

/**
 * Utility for testing async operations that should complete within a time limit
 */
export async function expectToCompleteWithin<T>(
	operation: () => Promise<T>,
	timeoutMs: number,
): Promise<T> {
	return Promise.race([
		operation(),
		delayedReject(
			timeoutMs,
			new Error(`Operation did not complete within ${timeoutMs}ms`),
		),
	])
}

/**
 * Utility for testing that an operation throws a specific error
 */
export async function expectToThrow(
	operation: () => Promise<any> | any,
	expectedError?: string | RegExp | Error,
): Promise<Error> {
	try {
		await operation()
		throw new Error('Expected operation to throw, but it did not')
	} catch (error) {
		if (!expectedError) {
			return error as Error
		}

		if (typeof expectedError === 'string') {
			if (!(error as Error).message.includes(expectedError)) {
				throw new Error(
					`Expected error message to include "${expectedError}", but got "${(error as Error).message}"`,
				)
			}
		} else if (expectedError instanceof RegExp) {
			if (!expectedError.test((error as Error).message)) {
				throw new Error(
					`Expected error message to match ${expectedError}, but got "${(error as Error).message}"`,
				)
			}
		} else if (expectedError instanceof Error) {
			if ((error as Error).message !== expectedError.message) {
				throw new Error(
					`Expected error message "${expectedError.message}", but got "${(error as Error).message}"`,
				)
			}
		}

		return error as Error
	}
}

/**
 * Creates a test fixture with setup and teardown capabilities
 */
export function createTestFixture<T>(
	setup: () => T | Promise<T>,
	teardown?: (fixture: T) => void | Promise<void>,
) {
	let fixture: T | undefined

	return {
		async getFixture(): Promise<T> {
			if (!fixture) {
				fixture = await setup()
			}
			return fixture
		},
		async cleanup(): Promise<void> {
			if (fixture && teardown) {
				await teardown(fixture)
				fixture = undefined
			}
		},
	}
}
