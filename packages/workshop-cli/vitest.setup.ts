import { vi, beforeEach, afterEach } from 'vitest'

// Global test setup
beforeEach(() => {
	// Mock console methods to prevent noise in test output
	vi.spyOn(console, 'error').mockImplementation(() => {})
	vi.spyOn(console, 'warn').mockImplementation(() => {})
	vi.spyOn(console, 'log').mockImplementation(() => {})
	
	// Mock process.exit to prevent tests from actually exiting
	vi.spyOn(process, 'exit').mockImplementation(() => {
		throw new Error('process.exit called')
	})
	
	// Mock timers for consistent test execution
	vi.useFakeTimers()
})

afterEach(() => {
	// Clean up all mocks after each test
	vi.restoreAllMocks()
	vi.useRealTimers()
	vi.clearAllMocks()
})

// Handle unhandled promise rejections in tests
process.on('unhandledRejection', (reason) => {
	console.error('Unhandled Rejection in test:', reason)
})