import { expect, test, vi } from 'vitest'

// lookout.ts reads ENV.SENTRY_DSN at module scope, so stub before importing.
vi.stubGlobal('ENV', {
	SENTRY_DSN: 'https://examplePublicKey@o0.ingest.sentry.io/0',
	SENTRY_PROJECT_ID: '0',
})
const { action, loader } = await import('../app/routes/resources+/lookout.ts')

test('returns 405 for GET because a resource route with no loader makes React Router report an internal server error (aha)', () => {
	const response = loader()

	expect(response.status).toBe(405)
	expect(response.headers.get('Allow')).toBe('POST')
})

test('rejects a body that is not a Sentry envelope with a 400, not a JSON.parse 500 (aha)', async () => {
	const request = new Request('http://localhost/resources/lookout', {
		method: 'POST',
		body: 'not an envelope',
	})

	await expect(
		action({ request, params: {}, context: {} } as Parameters<
			typeof action
		>[0]),
	).rejects.toMatchObject({ status: 400 })
})
