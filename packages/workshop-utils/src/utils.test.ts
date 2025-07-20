import { test, expect, vi, describe } from 'vitest'
import { getErrorMessage, handleGitHubRepoAndRoot } from './utils.js'

describe('getErrorMessage', () => {
	test('should return string errors as-is', () => {
		const error = 'Something went wrong'
		expect(getErrorMessage(error)).toBe('Something went wrong')
	})

	test('should extract message from Error objects', () => {
		const error = new Error('Database connection failed')
		expect(getErrorMessage(error)).toBe('Database connection failed')
	})

	test('should extract message from objects with message property', () => {
		const error = { message: 'Custom error message' }
		expect(getErrorMessage(error)).toBe('Custom error message')
	})

	test('should handle objects with non-string message property', () => {
		const error = { message: 123 }
		const consoleSpy = vi.spyOn(console, 'error')

		expect(getErrorMessage(error)).toBe('Unknown Error')
		expect(consoleSpy).toHaveBeenCalledWith(
			'Unable to get error message for error',
			error,
		)
	})

	test('should handle objects without message property', () => {
		const error = { code: 500, status: 'error' }
		const consoleSpy = vi.spyOn(console, 'error')

		expect(getErrorMessage(error)).toBe('Unknown Error')
		expect(consoleSpy).toHaveBeenCalledWith(
			'Unable to get error message for error',
			error,
		)
	})

	test('should handle null errors', () => {
		const consoleSpy = vi.spyOn(console, 'error')

		expect(getErrorMessage(null)).toBe('Unknown Error')
		expect(consoleSpy).toHaveBeenCalledWith(
			'Unable to get error message for error',
			null,
		)
	})

	test('should handle undefined errors', () => {
		const consoleSpy = vi.spyOn(console, 'error')

		expect(getErrorMessage(undefined)).toBe('Unknown Error')
		expect(consoleSpy).toHaveBeenCalledWith(
			'Unable to get error message for error',
			undefined,
		)
	})

	test('should handle primitive non-string errors', () => {
		const consoleSpy = vi.spyOn(console, 'error')

		expect(getErrorMessage(123)).toBe('Unknown Error')
		expect(consoleSpy).toHaveBeenCalledWith(
			'Unable to get error message for error',
			123,
		)

		expect(getErrorMessage(true)).toBe('Unknown Error')
		expect(consoleSpy).toHaveBeenCalledWith(
			'Unable to get error message for error',
			true,
		)
	})

	test('should handle empty objects', () => {
		const error = {}
		const consoleSpy = vi.spyOn(console, 'error')

		expect(getErrorMessage(error)).toBe('Unknown Error')
		expect(consoleSpy).toHaveBeenCalledWith(
			'Unable to get error message for error',
			error,
		)
	})

	test('should handle circular reference objects safely', () => {
		const error: any = { message: 'Circular error' }
		error.self = error
		
		expect(getErrorMessage(error)).toBe('Circular error')
	})

	test('should handle Error objects with additional properties', () => {
		const error = new Error('Base error')
		;(error as any).code = 'ERR_TEST'
		;(error as any).statusCode = 500
		
		expect(getErrorMessage(error)).toBe('Base error')
	})
})

describe('handleGitHubRepoAndRoot', () => {
	test('should handle githubRepo with trailing slash', () => {
		const result = handleGitHubRepoAndRoot({
			githubRepo: 'https://github.com/user/repo/',
		})

		expect(result).toEqual({
			githubRepo: 'https://github.com/user/repo',
			githubRoot: 'https://github.com/user/repo/tree/main',
		})
	})

	test('should handle githubRepo without trailing slash', () => {
		const result = handleGitHubRepoAndRoot({
			githubRepo: 'https://github.com/user/repo',
		})

		expect(result).toEqual({
			githubRepo: 'https://github.com/user/repo',
			githubRoot: 'https://github.com/user/repo/tree/main',
		})
	})

	test('should handle githubRoot with blob path', () => {
		const result = handleGitHubRepoAndRoot({
			githubRoot: 'https://github.com/user/repo/blob/main/src/file.ts',
		})

		expect(result).toEqual({
			githubRepo: 'https://github.com/user/repo',
			githubRoot: 'https://github.com/user/repo/tree/main',
		})
	})

	test('should handle githubRoot with tree path', () => {
		const result = handleGitHubRepoAndRoot({
			githubRoot: 'https://github.com/user/repo/tree/develop/src',
		})

		expect(result).toEqual({
			githubRepo: 'https://github.com/user/repo',
			githubRoot: 'https://github.com/user/repo/tree/main',
		})
	})

	test('should handle githubRoot without path', () => {
		const result = handleGitHubRepoAndRoot({
			githubRoot: 'https://github.com/user/repo',
		})

		expect(result).toEqual({
			githubRepo: 'https://github.com/user/repo',
			githubRoot: 'https://github.com/user/repo/tree/main',
		})
	})

	test('should prioritize githubRepo over githubRoot when both provided', () => {
		const result = handleGitHubRepoAndRoot({
			githubRepo: 'https://github.com/user/repo',
			githubRoot: 'https://github.com/other/repo/blob/main/src/file.ts',
		})

		expect(result).toEqual({
			githubRepo: 'https://github.com/user/repo',
			githubRoot: 'https://github.com/user/repo/tree/main',
		})
	})

	test('should throw error when neither githubRepo nor githubRoot provided', () => {
		expect(() => handleGitHubRepoAndRoot({})).toThrow(
			'Either githubRepo or githubRoot is required. Please ensure your epicshop package.json config includes either githubRepo or githubRoot configuration.',
		)
	})

	test('should throw error when both githubRepo and githubRoot are undefined', () => {
		expect(() =>
			handleGitHubRepoAndRoot({
				githubRepo: undefined,
				githubRoot: undefined,
			}),
		).toThrow(
			'Either githubRepo or githubRoot is required. Please ensure your epicshop package.json config includes either githubRepo or githubRoot configuration.',
		)
	})

	test('should handle githubRoot with complex blob path', () => {
		const result = handleGitHubRepoAndRoot({
			githubRoot:
				'https://github.com/user/repo/blob/feature-branch/packages/app/src/components/button.tsx',
		})

		expect(result).toEqual({
			githubRepo: 'https://github.com/user/repo',
			githubRoot: 'https://github.com/user/repo/tree/main',
		})
	})

	test('should handle githubRoot with complex tree path', () => {
		const result = handleGitHubRepoAndRoot({
			githubRoot:
				'https://github.com/user/repo/tree/develop/packages/workshop/src/utils.ts',
		})

		expect(result).toEqual({
			githubRepo: 'https://github.com/user/repo',
			githubRoot: 'https://github.com/user/repo/tree/main',
		})
	})

	test('should handle malformed GitHub URLs gracefully', () => {
		// The function doesn't validate URL format, it just processes strings
		const result = handleGitHubRepoAndRoot({
			githubRoot: 'not-a-valid-url'
		})
		
		expect(result.githubRepo).toBe('not-a-valid-url')
		expect(result.githubRoot).toBe('not-a-valid-url/tree/main')
	})

	test('should handle empty strings', () => {
		expect(() => handleGitHubRepoAndRoot({
			githubRepo: '',
			githubRoot: ''
		})).toThrow()
	})

	test('should handle non-GitHub URLs', () => {
		// The function doesn't validate that it's a GitHub URL, it just processes strings
		const result = handleGitHubRepoAndRoot({
			githubRepo: 'https://gitlab.com/user/repo'
		})
		
		expect(result.githubRepo).toBe('https://gitlab.com/user/repo')
		expect(result.githubRoot).toBe('https://gitlab.com/user/repo/tree/main')
	})
})
