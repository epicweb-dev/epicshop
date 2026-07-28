import { beforeEach, expect, test, vi } from 'vitest'

vi.mock('@epic-web/workshop-utils/db.server', () => ({
	requireAuthInfo: vi.fn(),
	logout: vi.fn(),
	setPreferences: vi.fn(),
}))
vi.mock('@epic-web/workshop-utils/cache.server', () => ({
	deleteCache: vi.fn(),
}))
vi.mock('@epic-web/workshop-utils/epic-api.server', () => ({
	getUserInfo: vi.fn(),
}))
vi.mock('#app/utils/misc.tsx', () => ({
	ensureUndeployed: vi.fn(),
	cn: (...args: Array<unknown>) => args.filter(Boolean).join(' '),
}))
vi.mock('#app/utils/auth.server.ts', () => ({
	registerDevice: vi.fn(),
}))

const { requireAuthInfo } = await import('@epic-web/workshop-utils/db.server')
const { getUserInfo } = await import('@epic-web/workshop-utils/epic-api.server')
const { loader: accountLoader } =
	await import('../app/routes/_app+/account.tsx')
const { loader: loginLoader } = await import('../app/routes/_app+/login.tsx')

beforeEach(() => {
	vi.clearAllMocks()
})

async function getRedirect(promise: Promise<unknown>) {
	const error = await promise.catch((value: unknown) => value)
	expect(error).toBeInstanceOf(Response)
	return error as Response
}

test('account loader redirects to login when auth tokens exist but userinfo is unavailable (aha: EPICSHOP-FX)', async () => {
	vi.mocked(requireAuthInfo).mockResolvedValue({
		id: 'user-1',
		tokenSet: { access_token: 'token' },
		email: 'person@example.com',
	} as never)
	vi.mocked(getUserInfo).mockResolvedValue(null)

	const response = await getRedirect(
		accountLoader({
			request: new Request('http://localhost/account'),
		} as Parameters<typeof accountLoader>[0]),
	)

	expect(response.status).toBe(302)
	expect(response.headers.get('Location')).toBe('/login')
})

test('account loader returns userinfo when available', async () => {
	const user = {
		id: 'user-1',
		email: 'person@example.com',
		name: 'Person',
	}
	vi.mocked(requireAuthInfo).mockResolvedValue({
		id: 'user-1',
		tokenSet: { access_token: 'token' },
		email: 'person@example.com',
	} as never)
	vi.mocked(getUserInfo).mockResolvedValue(user as never)

	await expect(
		accountLoader({
			request: new Request('http://localhost/account'),
		} as Parameters<typeof accountLoader>[0]),
	).resolves.toEqual({ user })
})

test('login loader does not redirect to account when auth tokens exist without userinfo (aha: EPICSHOP-FX)', async () => {
	vi.mocked(getUserInfo).mockResolvedValue(null)

	await expect(loginLoader()).resolves.toEqual({})
})

test('login loader redirects to account when userinfo is available', async () => {
	vi.mocked(getUserInfo).mockResolvedValue({
		id: 'user-1',
		email: 'person@example.com',
		name: 'Person',
	} as never)

	const response = await getRedirect(loginLoader())

	expect(response.status).toBe(302)
	expect(response.headers.get('Location')).toBe('/account')
})
