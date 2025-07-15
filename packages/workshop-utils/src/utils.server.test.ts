import { describe, it, expect, vi, beforeEach } from 'vitest'
import { checkConnection, checkConnectionCached, dayjs } from './utils.server.js'

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('utils.server', () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	describe('dayjs', () => {
		it('should be configured with required plugins', () => {
			const now = dayjs()
			
			// Test that UTC plugin is loaded
			expect(dayjs.utc).toBeDefined()
			
			// Test that timezone plugin is loaded
			expect(dayjs.tz).toBeDefined()
			
			// Test that relative time plugin is loaded
			expect(now.fromNow).toBeDefined()
			
			// Test basic functionality
			expect(dayjs('2024-01-01').isValid()).toBe(true)
		})

		it('should handle relative time formatting', () => {
			const past = dayjs().subtract(1, 'hour')
			const result = past.fromNow()
			expect(result).toContain('ago')
		})
	})

	describe('checkConnection', () => {
		it('should return true when cloudflare responds with ok', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
			})

			const result = await checkConnection()
			
			expect(result).toBe(true)
			expect(mockFetch).toHaveBeenCalledWith('https://www.cloudflare.com', {
				method: 'HEAD',
			})
		})

		it('should return false when cloudflare responds with not ok', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
			})

			const result = await checkConnection()
			
			expect(result).toBe(false)
			expect(mockFetch).toHaveBeenCalledWith('https://www.cloudflare.com', {
				method: 'HEAD',
			})
		})

		it('should return false when fetch throws an error', async () => {
			mockFetch.mockRejectedValueOnce(new Error('Network error'))

			const result = await checkConnection()
			
			expect(result).toBe(false)
			expect(mockFetch).toHaveBeenCalledWith('https://www.cloudflare.com', {
				method: 'HEAD',
			})
		})
	})

	describe('checkConnectionCached', () => {
		it('should return cached connection status', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
			})

			const result = await checkConnectionCached()
			
			expect(result).toBe(true)
			
			// Call again to test caching
			const cachedResult = await checkConnectionCached()
			expect(cachedResult).toBe(true)
			
			// Should only have been called once due to caching
			expect(mockFetch).toHaveBeenCalledTimes(1)
		})

		it('should handle request and timings parameters', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
			})

			const mockRequest = new Request('http://example.com')
			const mockTimings = { time: vi.fn() }

			const result = await checkConnectionCached({
				request: mockRequest,
				timings: mockTimings,
			})
			
			expect(result).toBe(true)
		})
	})
})