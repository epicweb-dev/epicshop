import { expect, test } from 'vitest'
import { action } from '../app/routes/$.tsx'

test('returns a plain 404 for scanner POSTs to catch-all paths', async () => {
	const response = action()

	expect(response.status).toBe(404)
	await expect(response.text()).resolves.toBe('Not found')
})
