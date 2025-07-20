import { test, expect, vi, beforeEach, afterEach } from 'vitest'
import { update } from './update.js'

// Mock the dynamic import of updateLocalRepo
vi.mock('@epic-web/workshop-utils/git.server', () => ({
	updateLocalRepo: vi.fn(),
}))

// Mock console methods to clean up test output
beforeEach(() => {
	vi.spyOn(console, 'log').mockImplementation(() => {})
	vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
	vi.restoreAllMocks()
})

test('update should return failure result when deployed environment', async () => {
	// Set deployed environment
	const originalEnv = process.env.EPICSHOP_DEPLOYED
	process.env.EPICSHOP_DEPLOYED = 'true'

	try {
		const result = await update({ silent: true })

		expect(result).toMatchObject({
			success: false,
			message: 'Updates are not available in deployed environments.',
		})
		expect(result.error).toBeUndefined()
	} finally {
		// Restore original environment
		process.env.EPICSHOP_DEPLOYED = originalEnv
	}
})

test('update should return failure result when deployed environment with 1', async () => {
	// Set deployed environment
	const originalEnv = process.env.EPICSHOP_DEPLOYED
	process.env.EPICSHOP_DEPLOYED = '1'

	try {
		const result = await update({ silent: true })

		expect(result).toMatchObject({
			success: false,
			message: 'Updates are not available in deployed environments.',
		})
		expect(result.error).toBeUndefined()
	} finally {
		// Restore original environment
		process.env.EPICSHOP_DEPLOYED = originalEnv
	}
})

test('update should return success result when no updates are available', async () => {
	// Ensure not in deployed environment
	const originalEnv = process.env.EPICSHOP_DEPLOYED
	delete process.env.EPICSHOP_DEPLOYED

	// Mock updateLocalRepo to return success with "no updates available" message
	const { updateLocalRepo } = await import(
		'@epic-web/workshop-utils/git.server'
	)
	vi.mocked(updateLocalRepo).mockResolvedValue({
		status: 'success',
		message: 'No updates available.',
	})

	try {
		const result = await update({ silent: true })

		// Should succeed with "no updates available" message
		expect(result).toMatchObject({
			success: true,
			message: 'No updates available.',
		})
		expect(result.error).toBeUndefined()
	} finally {
		// Restore original environment
		process.env.EPICSHOP_DEPLOYED = originalEnv
	}
})

test('update should return success result when updates are applied successfully', async () => {
	// Ensure not in deployed environment
	const originalEnv = process.env.EPICSHOP_DEPLOYED
	delete process.env.EPICSHOP_DEPLOYED

	// Mock updateLocalRepo to return success with update applied message
	const { updateLocalRepo } = await import(
		'@epic-web/workshop-utils/git.server'
	)
	vi.mocked(updateLocalRepo).mockResolvedValue({
		status: 'success',
		message: 'Updated successfully.',
	})

	try {
		const result = await update({ silent: true })

		// Should succeed with update applied message
		expect(result).toMatchObject({
			success: true,
			message: 'Updated successfully.',
		})
		expect(result.error).toBeUndefined()
	} finally {
		// Restore original environment
		process.env.EPICSHOP_DEPLOYED = originalEnv
	}
})

test('update should return failure result when updateLocalRepo fails', async () => {
	// Ensure not in deployed environment
	const originalEnv = process.env.EPICSHOP_DEPLOYED
	delete process.env.EPICSHOP_DEPLOYED

	// Mock updateLocalRepo to return error status
	const { updateLocalRepo } = await import(
		'@epic-web/workshop-utils/git.server'
	)
	vi.mocked(updateLocalRepo).mockResolvedValue({
		status: 'error',
		message: 'Git pull failed: network error',
	})

	try {
		const result = await update({ silent: true })

		// Should fail with error message from updateLocalRepo
		expect(result).toMatchObject({
			success: false,
			message: 'Git pull failed: network error',
		})
		expect(result.error).toBeUndefined()
	} finally {
		// Restore original environment
		process.env.EPICSHOP_DEPLOYED = originalEnv
	}
})

test('update should return failure result when updateLocalRepo throws an error', async () => {
	// Ensure not in deployed environment
	const originalEnv = process.env.EPICSHOP_DEPLOYED
	delete process.env.EPICSHOP_DEPLOYED

	// Mock updateLocalRepo to throw an error
	const { updateLocalRepo } = await import(
		'@epic-web/workshop-utils/git.server'
	)
	vi.mocked(updateLocalRepo).mockRejectedValue(new Error('Module not found'))

	try {
		const result = await update({ silent: true })

		// Should fail with generic error message
		expect(result).toMatchObject({
			success: false,
			message: 'Update functionality not available',
		})
		expect(result.error).toBeInstanceOf(Error)
		expect(result.error?.message).toBe('Module not found')
	} finally {
		// Restore original environment
		process.env.EPICSHOP_DEPLOYED = originalEnv
	}
})

test('update should log success message when silent is false', async () => {
	// Ensure not in deployed environment
	const originalEnv = process.env.EPICSHOP_DEPLOYED
	delete process.env.EPICSHOP_DEPLOYED

	// Mock updateLocalRepo to return success
	const { updateLocalRepo } = await import(
		'@epic-web/workshop-utils/git.server'
	)
	vi.mocked(updateLocalRepo).mockResolvedValue({
		status: 'success',
		message: 'Updated successfully.',
	})

	const consoleLogSpy = vi.spyOn(console, 'log')

	try {
		const result = await update({ silent: false })

		// Should succeed
		expect(result).toMatchObject({
			success: true,
			message: 'Updated successfully.',
		})
		// Should log the success message
		expect(consoleLogSpy).toHaveBeenCalledWith('✅ Updated successfully.')
	} finally {
		// Restore original environment
		process.env.EPICSHOP_DEPLOYED = originalEnv
	}
})

test('update should log error message when silent is false and updateLocalRepo fails', async () => {
	// Ensure not in deployed environment
	const originalEnv = process.env.EPICSHOP_DEPLOYED
	delete process.env.EPICSHOP_DEPLOYED

	// Mock updateLocalRepo to return error
	const { updateLocalRepo } = await import(
		'@epic-web/workshop-utils/git.server'
	)
	vi.mocked(updateLocalRepo).mockResolvedValue({
		status: 'error',
		message: 'Git pull failed: network error',
	})

	const consoleErrorSpy = vi.spyOn(console, 'error')

	try {
		const result = await update({ silent: false })

		// Should fail
		expect(result).toMatchObject({
			success: false,
			message: 'Git pull failed: network error',
		})
		// Should log the error message
		expect(consoleErrorSpy).toHaveBeenCalledWith(
			'❌ Git pull failed: network error',
		)
	} finally {
		// Restore original environment
		process.env.EPICSHOP_DEPLOYED = originalEnv
	}
})
