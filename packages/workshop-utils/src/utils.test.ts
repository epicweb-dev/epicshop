import { describe, it, expect } from 'vitest'
import { getErrorMessage, handleGitHubRepoAndRoot } from './utils.js'

describe('getErrorMessage', () => {
	it('should return the error message when error is a string', () => {
		const error = 'This is a string error'
		expect(getErrorMessage(error)).toBe('This is a string error')
	})

	it('should return the message property when error is an object with message', () => {
		const error = { message: 'This is an object error' }
		expect(getErrorMessage(error)).toBe('This is an object error')
	})

	it('should return the message property when error is an Error object', () => {
		const error = new Error('This is an Error object')
		expect(getErrorMessage(error)).toBe('This is an Error object')
	})

	it('should return "Unknown Error" when error is null', () => {
		expect(getErrorMessage(null)).toBe('Unknown Error')
	})

	it('should return "Unknown Error" when error is undefined', () => {
		expect(getErrorMessage(undefined)).toBe('Unknown Error')
	})

	it('should return "Unknown Error" when error is a number', () => {
		expect(getErrorMessage(123)).toBe('Unknown Error')
	})

	it('should return "Unknown Error" when error is an object without message', () => {
		expect(getErrorMessage({ foo: 'bar' })).toBe('Unknown Error')
	})

	it('should return "Unknown Error" when error is an object with non-string message', () => {
		expect(getErrorMessage({ message: 123 })).toBe('Unknown Error')
	})
})

describe('handleGitHubRepoAndRoot', () => {
	it('should generate githubRoot from githubRepo', () => {
		const result = handleGitHubRepoAndRoot({
			githubRepo: 'https://github.com/user/repo',
		})
		expect(result).toEqual({
			githubRepo: 'https://github.com/user/repo',
			githubRoot: 'https://github.com/user/repo/tree/main',
		})
	})

	it('should remove trailing slash from githubRepo', () => {
		const result = handleGitHubRepoAndRoot({
			githubRepo: 'https://github.com/user/repo/',
		})
		expect(result).toEqual({
			githubRepo: 'https://github.com/user/repo',
			githubRoot: 'https://github.com/user/repo/tree/main',
		})
	})

	it('should extract githubRepo from githubRoot with blob', () => {
		const result = handleGitHubRepoAndRoot({
			githubRoot: 'https://github.com/user/repo/blob/main/path/to/file',
		})
		expect(result).toEqual({
			githubRepo: 'https://github.com/user/repo',
			githubRoot: 'https://github.com/user/repo/tree/main',
		})
	})

	it('should extract githubRepo from githubRoot with tree', () => {
		const result = handleGitHubRepoAndRoot({
			githubRoot: 'https://github.com/user/repo/tree/main/path/to/file',
		})
		expect(result).toEqual({
			githubRepo: 'https://github.com/user/repo',
			githubRoot: 'https://github.com/user/repo/tree/main',
		})
	})

	it('should throw error when neither githubRepo nor githubRoot is provided', () => {
		expect(() => handleGitHubRepoAndRoot({})).toThrow(
			'Either githubRepo or githubRoot is required',
		)
	})

	it('should prefer githubRepo over githubRoot when both are provided', () => {
		const result = handleGitHubRepoAndRoot({
			githubRepo: 'https://github.com/user/repo1',
			githubRoot: 'https://github.com/user/repo2/tree/main',
		})
		expect(result).toEqual({
			githubRepo: 'https://github.com/user/repo1',
			githubRoot: 'https://github.com/user/repo1/tree/main',
		})
	})
})