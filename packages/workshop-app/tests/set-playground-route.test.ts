import { expect, test, vi } from 'vitest'

vi.mock('@epic-web/workshop-utils/apps.server', () => ({
	getAppByName: vi.fn(),
	getApps: vi.fn(),
	isPlaygroundApp: vi.fn(),
	isProblemApp: vi.fn(),
	isSolutionApp: vi.fn(),
	setPlayground: vi.fn(),
}))
vi.mock('@epic-web/workshop-utils/db.server', () => ({
	markOnboardingComplete: vi.fn(),
}))
vi.mock('@epic-web/workshop-utils/diff.server', () => ({
	getDiffPatch: vi.fn(),
}))
vi.mock('@epic-web/workshop-utils/process-manager.server', () => ({
	clearTestProcessEntry: vi.fn(),
}))

const { loader } = await import('../app/routes/set-playground.tsx')

test('returns 405 for GET because a resource route with no loader makes React Router report an internal server error (aha)', () => {
	const response = loader()

	expect(response.status).toBe(405)
	expect(response.headers.get('Allow')).toBe('POST')
})
