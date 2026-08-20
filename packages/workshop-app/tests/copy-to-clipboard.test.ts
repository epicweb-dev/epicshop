import { afterEach, expect, test, vi } from 'vitest'
import { copyToClipboard } from '../app/utils/copy-to-clipboard.ts'

afterEach(() => {
	vi.unstubAllGlobals()
})

test('returns unavailable when navigator.clipboard is missing (aha)', async () => {
	vi.stubGlobal('navigator', {})

	await expect(copyToClipboard('hello')).resolves.toEqual({
		status: 'unavailable',
	})
})

test('copies text when clipboard API is available', async () => {
	const writeText = vi.fn().mockResolvedValue(undefined)
	vi.stubGlobal('navigator', { clipboard: { writeText } })

	await expect(copyToClipboard('hello')).resolves.toEqual({ status: 'copied' })
	expect(writeText).toHaveBeenCalledWith('hello')
})

test('returns failed when writeText rejects', async () => {
	const error = new Error('permission denied')
	const writeText = vi.fn().mockRejectedValue(error)
	vi.stubGlobal('navigator', { clipboard: { writeText } })

	await expect(copyToClipboard('hello')).resolves.toEqual({
		status: 'failed',
		error,
	})
})
