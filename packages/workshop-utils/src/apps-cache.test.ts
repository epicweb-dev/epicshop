import { type CacheEntry } from '@epic-web/cachified'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { getForceFreshForDir } from './apps.server.js'

describe('apps cache invalidation', () => {
	beforeEach(() => {
		// Clear environment variables
		delete process.env.EPICSHOP_DEPLOYED
	})

	afterEach(() => {
		// Reset environment
		delete process.env.EPICSHOP_DEPLOYED
		vi.restoreAllMocks()
	})

	it('should force fresh when no cache entry exists', async () => {
		const result = await getForceFreshForDir(null, '/some/dir')
		expect(result).toBe(true)
	})

	it('should force fresh when no modified time is set in non-deployed environments', async () => {
		const mockCacheEntry: CacheEntry = {
			value: {},
			metadata: {
				createdTime: Date.now() - 1000,
				ttl: null,
				swr: null,
			},
		}

		// Mock the modifiedTimes map to be empty (no modified times set)
		const { modifiedTimes } = await import('./apps.server.js')
		modifiedTimes.clear()

		const result = await getForceFreshForDir(mockCacheEntry, '/some/dir')
		expect(result).toBe(true)
	})

	it('should not force fresh in deployed environments even with no modified time', async () => {
		process.env.EPICSHOP_DEPLOYED = 'true'

		const mockCacheEntry: CacheEntry = {
			value: {},
			metadata: {
				createdTime: Date.now() - 1000,
				ttl: null,
				swr: null,
			},
		}

		// Mock the modifiedTimes map to be empty
		const { modifiedTimes } = await import('./apps.server.js')
		modifiedTimes.clear()

		const result = await getForceFreshForDir(mockCacheEntry, '/some/dir')
		expect(result).toBe(false)
	})

	it('should force fresh when modified time is newer than cache in non-deployed environments', async () => {
		const cacheCreatedTime = Date.now() - 5000
		const mockCacheEntry: CacheEntry = {
			value: {},
			metadata: {
				createdTime: cacheCreatedTime,
				ttl: null,
				swr: null,
			},
		}

		// Mock the modifiedTimes map to have a newer modification time
		const { modifiedTimes } = await import('./apps.server.js')
		modifiedTimes.set('/some/dir', cacheCreatedTime + 1000)

		const result = await getForceFreshForDir(mockCacheEntry, '/some/dir')
		expect(result).toBe(true)
	})

	it('should not force fresh when cache is newer than modified time in non-deployed environments', async () => {
		const modificationTime = Date.now() - 5000
		const mockCacheEntry: CacheEntry = {
			value: {},
			metadata: {
				createdTime: modificationTime + 1000,
				ttl: null,
				swr: null,
			},
		}

		// Mock the modifiedTimes map to have an older modification time
		const { modifiedTimes } = await import('./apps.server.js')
		modifiedTimes.set('/some/dir', modificationTime)

		const result = await getForceFreshForDir(mockCacheEntry, '/some/dir')
		expect(result).toBe(false)
	})

	it('should not force fresh in deployed environments even when file is newer', async () => {
		process.env.EPICSHOP_DEPLOYED = '1'

		const cacheCreatedTime = Date.now() - 5000
		const mockCacheEntry: CacheEntry = {
			value: {},
			metadata: {
				createdTime: cacheCreatedTime,
				ttl: null,
				swr: null,
			},
		}

		// Mock the modifiedTimes map to have a newer modification time
		const { modifiedTimes } = await import('./apps.server.js')
		modifiedTimes.set('/some/dir', cacheCreatedTime + 1000)

		const result = await getForceFreshForDir(mockCacheEntry, '/some/dir')
		expect(result).toBe(false)
	})
})