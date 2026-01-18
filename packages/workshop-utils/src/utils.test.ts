import { test, expect, vi } from 'vitest'
import { getErrorMessage, handleGitHubRepoAndRoot } from './utils.ts'

test('getErrorMessage should return string errors as-is', () => {
	const error = 'Something went wrong'
	expect(getErrorMessage(error)).toBe('Something went wrong')
})

test('getErrorMessage should extract message from Error objects', () => {
	const error = new Error('Database connection failed')
	expect(getErrorMessage(error)).toBe('Database connection failed')
})

test('getErrorMessage should extract message from objects with message property', () => {
	const error = { message: 'Custom error message' }
	expect(getErrorMessage(error)).toBe('Custom error message')
})

test('getErrorMessage should handle objects with non-string message property', () => {
	const error = { message: 123 }
	vi.mocked(console.error).mockImplementation(() => {})

	expect(getErrorMessage(error)).toBe('Unknown Error')
	expect(console.error).toHaveBeenCalledWith(
		'Unable to get error message for error',
		error,
	)
})

test('getErrorMessage should handle objects without message property', () => {
	const error = { code: 500, status: 'error' }
	vi.mocked(console.error).mockImplementation(() => {})

	expect(getErrorMessage(error)).toBe('Unknown Error')
	expect(console.error).toHaveBeenCalledWith(
		'Unable to get error message for error',
		error,
	)
})

test('getErrorMessage should handle null errors', () => {
	vi.mocked(console.error).mockImplementation(() => {})

	expect(getErrorMessage(null)).toBe('Unknown Error')
	expect(console.error).toHaveBeenCalledWith(
		'Unable to get error message for error',
		null,
	)
})

test('getErrorMessage should handle undefined errors', () => {
	vi.mocked(console.error).mockImplementation(() => {})

	expect(getErrorMessage(undefined)).toBe('Unknown Error')
	expect(console.error).toHaveBeenCalledWith(
		'Unable to get error message for error',
		undefined,
	)
})

test('getErrorMessage should handle primitive non-string errors', () => {
	vi.mocked(console.error).mockImplementation(() => {})

	expect(getErrorMessage(123)).toBe('Unknown Error')
	expect(console.error).toHaveBeenCalledWith(
		'Unable to get error message for error',
		123,
	)

	expect(getErrorMessage(true)).toBe('Unknown Error')
	expect(console.error).toHaveBeenCalledWith(
		'Unable to get error message for error',
		true,
	)
})

test('getErrorMessage should handle empty objects', () => {
	const error = {}
	vi.mocked(console.error).mockImplementation(() => {})

	expect(getErrorMessage(error)).toBe('Unknown Error')
	expect(console.error).toHaveBeenCalledWith(
		'Unable to get error message for error',
		error,
	)
})

test('handleGitHubRepoAndRoot should handle githubRepo with trailing slash', () => {
	const result = handleGitHubRepoAndRoot({
		githubRepo: 'https://github.com/user/repo/',
	})

	expect(result).toEqual({
		githubRepo: 'https://github.com/user/repo',
		githubRoot: 'https://github.com/user/repo/tree/main',
	})
})

test('handleGitHubRepoAndRoot should handle githubRepo without trailing slash', () => {
	const result = handleGitHubRepoAndRoot({
		githubRepo: 'https://github.com/user/repo',
	})

	expect(result).toEqual({
		githubRepo: 'https://github.com/user/repo',
		githubRoot: 'https://github.com/user/repo/tree/main',
	})
})

test('handleGitHubRepoAndRoot should handle githubRoot with blob path', () => {
	const result = handleGitHubRepoAndRoot({
		githubRoot: 'https://github.com/user/repo/blob/main/src/file.ts',
	})

	expect(result).toEqual({
		githubRepo: 'https://github.com/user/repo',
		githubRoot: 'https://github.com/user/repo/tree/main',
	})
})

test('handleGitHubRepoAndRoot should handle githubRoot with tree path', () => {
	const result = handleGitHubRepoAndRoot({
		githubRoot: 'https://github.com/user/repo/tree/develop/src',
	})

	expect(result).toEqual({
		githubRepo: 'https://github.com/user/repo',
		githubRoot: 'https://github.com/user/repo/tree/main',
	})
})

test('handleGitHubRepoAndRoot should handle githubRoot without path', () => {
	const result = handleGitHubRepoAndRoot({
		githubRoot: 'https://github.com/user/repo',
	})

	expect(result).toEqual({
		githubRepo: 'https://github.com/user/repo',
		githubRoot: 'https://github.com/user/repo/tree/main',
	})
})

test('handleGitHubRepoAndRoot should prioritize githubRepo over githubRoot when both provided', () => {
	const result = handleGitHubRepoAndRoot({
		githubRepo: 'https://github.com/user/repo',
		githubRoot: 'https://github.com/other/repo/blob/main/src/file.ts',
	})

	expect(result).toEqual({
		githubRepo: 'https://github.com/user/repo',
		githubRoot: 'https://github.com/user/repo/tree/main',
	})
})

test('handleGitHubRepoAndRoot should throw error when neither githubRepo nor githubRoot provided', () => {
	expect(() => handleGitHubRepoAndRoot({})).toThrow(
		'Either githubRepo or githubRoot is required. Please ensure your epicshop package.json config includes either githubRepo or githubRoot configuration.',
	)
})

test('handleGitHubRepoAndRoot should throw error when both githubRepo and githubRoot are undefined', () => {
	expect(() =>
		handleGitHubRepoAndRoot({
			githubRepo: undefined,
			githubRoot: undefined,
		}),
	).toThrow(
		'Either githubRepo or githubRoot is required. Please ensure your epicshop package.json config includes either githubRepo or githubRoot configuration.',
	)
})

test('handleGitHubRepoAndRoot should handle githubRoot with complex blob path', () => {
	const result = handleGitHubRepoAndRoot({
		githubRoot:
			'https://github.com/user/repo/blob/feature-branch/packages/app/src/components/button.tsx',
	})

	expect(result).toEqual({
		githubRepo: 'https://github.com/user/repo',
		githubRoot: 'https://github.com/user/repo/tree/main',
	})
})

test('handleGitHubRepoAndRoot should handle githubRoot with complex tree path', () => {
	const result = handleGitHubRepoAndRoot({
		githubRoot:
			'https://github.com/user/repo/tree/develop/packages/workshop/src/utils.ts',
	})

	expect(result).toEqual({
		githubRepo: 'https://github.com/user/repo',
		githubRoot: 'https://github.com/user/repo/tree/main',
	})
})
