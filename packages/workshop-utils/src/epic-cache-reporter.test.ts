import { expect, test, vi, beforeEach } from 'vitest'
import { epicCacheReporter } from './cache.server.js'
import { logger } from './logger.js'

// Mock the logger module
vi.mock('./logger.js', () => ({
	logger: vi.fn(),
}))

beforeEach(() => {
	vi.clearAllMocks()
})

function createMockLogger() {
	const mockLog = vi.fn()
	const mockLogger = Object.assign(mockLog, {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		isEnabled: vi.fn(),
		namespace: 'mock-namespace',
		logger: vi.fn(),
	})
	return { mockLog, mockLogger }
}

function setupMocks(loggingEnabled: boolean = true) {
	const { mockLog, mockLogger } = createMockLogger()
	const loggerMock = vi.mocked(logger)

	loggerMock.mockReturnValue(mockLogger)
	mockLogger.isEnabled.mockReturnValue(loggingEnabled)

	return { mockLog, mockLogger, loggerMock }
}

function createCacheContext(
	cacheConfig: Partial<{ name: string; toString: () => string }> = {},
) {
	return {
		key: 'test-key',
		fallbackToCache: false,
		forceFresh: false,
		metadata: { ttl: 1000 },
		cache: {
			name:
				'name' in cacheConfig
					? cacheConfig.name
					: 'Filesystem cache (TestCache)',
			toString: cacheConfig.toString ?? (() => '[object Cache]'),
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
}

function createReporterAndEventHandler(
	cacheConfig?: Partial<{ name: string; toString: () => string }>,
	loggingEnabled: boolean = true,
) {
	const mocks = setupMocks(loggingEnabled)
	const reporter = epicCacheReporter()
	const cacheContext = createCacheContext(cacheConfig)
	const eventHandler = reporter(cacheContext)

	return { ...mocks, eventHandler }
}

test('epicCacheReporter creates logger with correct namespace', () => {
	const { mockLogger, loggerMock } = createReporterAndEventHandler()

	expect(mockLogger.isEnabled).toHaveBeenCalled()
	expect(loggerMock).toHaveBeenCalledWith('epic:cache:testcache')
})

test('epicCacheReporter handles LRU cache naming', () => {
	const { mockLogger, loggerMock } = createReporterAndEventHandler({
		name: 'LRUCache',
	})

	expect(mockLogger.isEnabled).toHaveBeenCalled()
	expect(loggerMock).toHaveBeenCalledWith('epic:cache:lru')
})

test('epicCacheReporter handles unknown cache naming', () => {
	const { mockLogger, loggerMock } = createReporterAndEventHandler({
		name: undefined,
		toString: () => '[object Object]',
	})

	expect(mockLogger.isEnabled).toHaveBeenCalled()
	expect(loggerMock).toHaveBeenCalledWith('epic:cache:object')
})

test('epicCacheReporter logs cache events correctly', () => {
	const { mockLog, mockLogger, eventHandler } = createReporterAndEventHandler()

	// Test a cache error event
	eventHandler({
		name: 'getCachedValueError',
		error: new Error('Cache read failed'),
	} as any)

	expect(mockLogger.error).toHaveBeenCalledWith(
		'error with cache at test-key. Deleting the cache key and trying to get a fresh value.',
		expect.any(Error),
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
		expect.stringContaining('Caching for'),
	)
})

test('epicCacheReporter returns no-op when logging is disabled', () => {
	const { mockLog, mockLogger, loggerMock, eventHandler } =
		createReporterAndEventHandler(undefined, false)

	// Verify logger was called
	expect(loggerMock).toHaveBeenCalledWith('epic:cache:testcache')
	// Verify isEnabled was called and returned false
	expect(mockLogger.isEnabled).toHaveBeenCalled()
	expect(mockLogger.isEnabled).toHaveReturnedWith(false)

	// Test that events are ignored when logging is disabled
	eventHandler({
		name: 'getCachedValueError',
		error: new Error('Cache read failed'),
	} as any)

	// No logging should occur
	expect(mockLogger.error).not.toHaveBeenCalled()
	expect(mockLog).not.toHaveBeenCalled()
})
