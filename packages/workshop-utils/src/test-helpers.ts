import { vi } from 'vitest'

/**
 * Test utilities for consistent and reliable testing across the workshop packages
 */

/**
 * Creates a mock function with better type safety and debugging capabilities
 */
export function createMockFn<T extends (...args: any[]) => any>(
	name?: string,
	implementation?: T,
): T & { mockName: string } {
	const mockFn = vi.fn(implementation) as T & { mockName: string }
	mockFn.mockName = name || 'anonymous-mock'
	return mockFn
}

/**
 * Creates a promise that resolves after a specified delay
 * Useful for testing async operations with controlled timing
 */
export function delay(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Creates a promise that rejects after a specified delay
 * Useful for testing error handling with timeouts
 */
export function delayedReject(ms: number, error: Error): Promise<never> {
	return new Promise((_, reject) => setTimeout(() => reject(error), ms))
}

/**
 * Waits for a condition to become true with a timeout
 * Useful for testing async state changes
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
export function createTestEnvironment() {
	const mockConsole = createMockConsole()
	
	// Mock global console
	vi.spyOn(console, 'log').mockImplementation(mockConsole.log)
	vi.spyOn(console, 'error').mockImplementation(mockConsole.error)
	vi.spyOn(console, 'warn').mockImplementation(mockConsole.warn)
	
	// Mock timers
	vi.useFakeTimers()
	
	return {
		console: mockConsole,
		cleanup: () => {
			vi.restoreAllMocks()
			vi.useRealTimers()
			mockConsole.clear()
		},
		advanceTime: (ms: number) => {
			vi.advanceTimersByTime(ms)
		},
		runAllTimers: () => {
			vi.runAllTimers()
		},
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