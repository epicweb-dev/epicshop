import { expect, test, vi } from 'vitest'

// Keep the test from touching the real workshop database.
vi.mock('@epic-web/workshop-utils/db.server', () => ({
	muteNotification: vi.fn<(id: string) => Promise<void>>(),
}))

const { loader } = await import('../app/routes/admin+/notifications.tsx')

test('returns 405 for GET because a resource route with no loader makes React Router report an internal server error', () => {
	const response = loader()

	expect(response.status).toBe(405)
	expect(response.headers.get('Allow')).toBe('POST')
})
