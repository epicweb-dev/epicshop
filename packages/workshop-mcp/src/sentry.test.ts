import { describe, it, expect, vi, beforeEach } from 'vitest'
import { initSentry, captureMcpError, addMcpBreadcrumb, startMcpTransaction } from './sentry.js'

// Mock environment variables
const originalEnv = process.env

describe('Sentry Integration', () => {
	beforeEach(() => {
		vi.resetModules()
		process.env = { ...originalEnv }
	})

	it('should initialize Sentry when SENTRY_DSN is set', () => {
		process.env.SENTRY_DSN = 'https://test@sentry.io/123'
		process.env.NODE_ENV = 'test'
		
		// Mock console methods to avoid noise in tests
		const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
		
		initSentry()
		
		expect(consoleSpy).toHaveBeenCalledWith('Sentry initialized successfully for MCP server monitoring')
		consoleSpy.mockRestore()
	})

	it('should warn when SENTRY_DSN is not set', () => {
		delete process.env.SENTRY_DSN
		
		const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
		
		initSentry()
		
		expect(consoleSpy).toHaveBeenCalledWith('SENTRY_DSN not set, Sentry monitoring disabled')
		consoleSpy.mockRestore()
	})

	it('should create transaction objects with proper interface', () => {
		const transaction = startMcpTransaction('test_transaction', 'test.operation')
		
		expect(transaction).toBeDefined()
		expect(typeof transaction?.setStatus).toBe('function')
		expect(typeof transaction?.finish).toBe('function')
	})

	it('should handle breadcrumb addition gracefully', () => {
		// This should not throw even if Sentry is not initialized
		expect(() => {
			addMcpBreadcrumb('test message', 'test.category', { test: 'data' })
		}).not.toThrow()
	})

	it('should handle error capture gracefully', () => {
		// This should not throw even if Sentry is not initialized
		const testError = new Error('Test error')
		expect(() => {
			captureMcpError(testError, { context: 'test' })
		}).not.toThrow()
	})
})