import { test, expect, vi } from 'vitest'
import { warm, type WarmResult } from './warm.ts'

test('warm should return a result with correct structure', async () => {
	const resultPromise = warm({ silent: true })

	await expect(resultPromise).resolves.toEqual(
		expect.objectContaining({
			success: expect.any(Boolean),
			message: expect.any(String),
		}),
	)
})

test('warm should accept silent parameter', async () => {
	const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
	vi.mocked(console.error).mockImplementation(() => {})

	try {
		await expect(warm({ silent: true })).resolves.toEqual(
			expect.objectContaining({
				success: expect.any(Boolean),
				message: expect.any(String),
			}),
		)

		await expect(warm({ silent: false })).resolves.toEqual(
			expect.objectContaining({
				success: expect.any(Boolean),
				message: expect.any(String),
			}),
		)

		await expect(warm()).resolves.toEqual(
			expect.objectContaining({
				success: expect.any(Boolean),
				message: expect.any(String),
			}),
		)
	} finally {
		logSpy.mockRestore()
	}
})

test('WarmResult type should have correct structure', () => {
	const result: WarmResult = {
		success: true,
		message: 'Test message',
	}

	expect(result.success).toBe(true)
	expect(result.message).toBe('Test message')
	expect(result.error).toBeUndefined()
})

test('WarmResult type should handle error case', () => {
	const error = new Error('Test error')
	const result: WarmResult = {
		success: false,
		message: 'Error occurred',
		error,
	}

	expect(result.success).toBe(false)
	expect(result.message).toBe('Error occurred')
	expect(result.error).toBe(error)
})

test('warm function should handle errors gracefully', async () => {
	const resultPromise = warm({ silent: true })

	await expect(resultPromise).resolves.toEqual(
		expect.objectContaining({
			success: expect.any(Boolean),
			message: expect.any(String),
		}),
	)

	const result = await resultPromise
	if (!result.success) {
		expect(result.error).toBeInstanceOf(Error)
	}
})
