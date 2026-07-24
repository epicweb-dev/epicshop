import { expect, test, vi } from 'vitest'

test('returns 405 for GET because a resource route with no loader makes React Router report an internal server error (aha)', async () => {
	// lookout.ts reads ENV.SENTRY_DSN at module scope, so stub before importing.
	vi.stubGlobal('ENV', {
		SENTRY_DSN: 'https://examplePublicKey@o0.ingest.sentry.io/0',
		SENTRY_PROJECT_ID: '0',
	})
	const { loader } = await import('../app/routes/resources+/lookout.ts')

	const response = loader()

	expect(response.status).toBe(405)
	expect(response.headers.get('Allow')).toBe('POST')
})
