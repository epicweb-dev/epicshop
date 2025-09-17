import { expect, test, vi, beforeEach } from 'vitest'
import { epicCacheReporter } from './cache.server.js'
import { logger, isLoggingEnabled } from './logger.js'

// Mock the logger module
vi.mock('./logger.js', () => ({
	logger: vi.fn(),
	isLoggingEnabled: vi.fn(),
}))

beforeEach(() => {
	vi.clearAllMocks()
})

test('epicCacheReporter creates logger with correct namespace', () => {
	const mockLog = vi.fn()
	const mockLogger = Object.assign(mockLog, {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	})
	
	// Set up the mocks
	const loggerMock = vi.mocked(logger)
	const isLoggingEnabledMock = vi.mocked(isLoggingEnabled)
	
	loggerMock.mockReturnValue(mockLogger)
	isLoggingEnabledMock.mockReturnValue(true) // Enable logging for this test

	const reporter = epicCacheReporter()
	
	// Create a minimal cache context that satisfies the types
	const cacheContext = {
		key: 'test-key',
		fallbackToCache: false,
		forceFresh: false,
		metadata: { ttl: 1000 },
		cache: {
			name: 'Filesystem cache (TestCache)',
			get: vi.fn(),
			set: vi.fn(),
			delete: vi.fn(),
		},
		getFreshValue: vi.fn(),
		ttl: 1000,
		staleWhileRevalidate: 0,
		checkValue: vi.fn(),
		report: vi.fn(),
	} as any

	// Initialize the reporter
	const eventHandler = reporter(cacheContext)

	// Verify the isLoggingEnabled was called with correct namespace
	expect(isLoggingEnabledMock).toHaveBeenCalledWith('epic:cache:testcache')
	// Verify the logger was called with correct namespace
	expect(loggerMock).toHaveBeenCalledWith('epic:cache:testcache')
})

test('epicCacheReporter handles LRU cache naming', () => {
	const mockLog = vi.fn()
	const mockLogger = Object.assign(mockLog, {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	})
	
	const loggerMock = vi.mocked(logger)
	const isLoggingEnabledMock = vi.mocked(isLoggingEnabled)
	
	loggerMock.mockReturnValue(mockLogger)
	isLoggingEnabledMock.mockReturnValue(true) // Enable logging for this test

	const reporter = epicCacheReporter()
	
	const cacheContext = {
		key: 'test-key',
		fallbackToCache: false,
		forceFresh: false,
		metadata: { ttl: 1000 },
		cache: {
			name: 'LRUCache',
			get: vi.fn(),
			set: vi.fn(),
			delete: vi.fn(),
		},
		getFreshValue: vi.fn(),
		ttl: 1000,
		staleWhileRevalidate: 0,
		checkValue: vi.fn(),
		report: vi.fn(),
	} as any

	const eventHandler = reporter(cacheContext)

	expect(isLoggingEnabledMock).toHaveBeenCalledWith('epic:cache:lru')
	expect(loggerMock).toHaveBeenCalledWith('epic:cache:lru')
})

test('epicCacheReporter handles unknown cache naming', () => {
	const mockLog = vi.fn()
	const mockLogger = Object.assign(mockLog, {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	})
	
	const loggerMock = vi.mocked(logger)
	const isLoggingEnabledMock = vi.mocked(isLoggingEnabled)
	
	loggerMock.mockReturnValue(mockLogger)
	isLoggingEnabledMock.mockReturnValue(true) // Enable logging for this test

	const reporter = epicCacheReporter()
	
	const cacheContext = {
		key: 'test-key',
		fallbackToCache: false,
		forceFresh: false,
		metadata: { ttl: 1000 },
		cache: {
			name: undefined,
			toString: () => '[object Object]',
			get: vi.fn(),
			set: vi.fn(),
			delete: vi.fn(),
		},
		getFreshValue: vi.fn(),
		ttl: 1000,
		staleWhileRevalidate: 0,
		checkValue: vi.fn(),
		report: vi.fn(),
	} as any

	const eventHandler = reporter(cacheContext)

	expect(isLoggingEnabledMock).toHaveBeenCalledWith('epic:cache:object')
	expect(loggerMock).toHaveBeenCalledWith('epic:cache:object')
})

test('epicCacheReporter logs cache events correctly', () => {
	const mockLog = vi.fn()
	const mockLogger = Object.assign(mockLog, {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	})
	
	const loggerMock = vi.mocked(logger)
	const isLoggingEnabledMock = vi.mocked(isLoggingEnabled)
	
	loggerMock.mockReturnValue(mockLogger)
	isLoggingEnabledMock.mockReturnValue(true) // Enable logging for this test

	const reporter = epicCacheReporter()
	
	const cacheContext = {
		key: 'test-key',
		fallbackToCache: false,
		forceFresh: false,
		metadata: { ttl: 1000 },
		cache: {
			name: 'Filesystem cache (TestCache)',
			get: vi.fn(),
			set: vi.fn(),
			delete: vi.fn(),
		},
		getFreshValue: vi.fn(),
		ttl: 1000,
		staleWhileRevalidate: 0,
		checkValue: vi.fn(),
		report: vi.fn(),
	} as any

	const eventHandler = reporter(cacheContext)

	// Test a cache error event
	eventHandler({
		name: 'getCachedValueError',
		error: new Error('Cache read failed'),
	} as any)

	expect(mockLogger.error).toHaveBeenCalledWith(
		'error with cache at test-key. Deleting the cache key and trying to get a fresh value.',
		expect.any(Error)
	)

	// Test a fresh value success event
	eventHandler({ name: 'getFreshValueStart' } as any)
	eventHandler({
		name: 'writeFreshValueSuccess',
		written: true,
		metadata: { ttl: 1000 },
		migrated: false,
	} as any)

	expect(mockLog).toHaveBeenCalledWith(
		'Updated the cache value for test-key.',
		expect.stringContaining('Getting a fresh value for this took'),
		expect.stringContaining('Caching for')
	)
})

test('epicCacheReporter returns no-op when logging is disabled', () => {
	const mockLog = vi.fn()
	const mockLogger = Object.assign(mockLog, {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	})
	
	const loggerMock = vi.mocked(logger)
	const isLoggingEnabledMock = vi.mocked(isLoggingEnabled)
	
	loggerMock.mockReturnValue(mockLogger)
	isLoggingEnabledMock.mockReturnValue(false) // Disable logging for this test

	const reporter = epicCacheReporter()
	
	const cacheContext = {
		key: 'test-key',
		fallbackToCache: false,
		forceFresh: false,
		metadata: { ttl: 1000 },
		cache: {
			name: 'Filesystem cache (TestCache)',
			get: vi.fn(),
			set: vi.fn(),
			delete: vi.fn(),
		},
		getFreshValue: vi.fn(),
		ttl: 1000,
		staleWhileRevalidate: 0,
		checkValue: vi.fn(),
		report: vi.fn(),
	} as any

	const eventHandler = reporter(cacheContext)

	// Verify isLoggingEnabled was called
	expect(isLoggingEnabledMock).toHaveBeenCalledWith('epic:cache:testcache')
	// Verify logger was NOT called since logging is disabled
	expect(loggerMock).not.toHaveBeenCalled()

	// Test that events are ignored when logging is disabled
	eventHandler({
		name: 'getCachedValueError',
		error: new Error('Cache read failed'),
	} as any)

	// No logging should occur
	expect(mockLogger.error).not.toHaveBeenCalled()
	expect(mockLog).not.toHaveBeenCalled()
})