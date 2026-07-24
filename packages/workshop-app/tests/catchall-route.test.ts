import { expect, test } from 'vitest'
import { action, loader } from '../app/routes/$.tsx'

test('returns a plain 404 for scanner POSTs to catch-all paths', async () => {
	const response = action()

	expect(response.status).toBe(404)
	await expect(response.text()).resolves.toBe('Not found')
})

function callLoader(splat: string | undefined) {
	return loader({ params: { '*': splat } } as Parameters<typeof loader>[0])
}

test('404s when the first segment is empty because Number("") is 0 (aha: //.env%00 used to 500)', async () => {
	await expect(callLoader('/.env\u0000')).rejects.toMatchObject({ status: 404 })
})

test('redirects a numeric exercise path to /exercise/...', async () => {
	const response = await callLoader('1/1')
	expect(response.status).toBe(302)
	expect(response.headers.get('Location')).toBe('/exercise/1/1')
})

test('redirects a zero-padded exercise path including the step type', async () => {
	const response = await callLoader('01/02/problem')
	expect(response.status).toBe(302)
	expect(response.headers.get('Location')).toBe('/exercise/01/02/problem')
})

test('404s a non-numeric first segment', async () => {
	await expect(callLoader('foo/bar')).rejects.toMatchObject({ status: 404 })
})

test('404s a first segment with surrounding whitespace (Number would coerce)', async () => {
	await expect(callLoader(' 1 /2')).rejects.toMatchObject({ status: 404 })
})

test('404s an empty splat', async () => {
	await expect(callLoader('')).rejects.toMatchObject({ status: 404 })
})

test('404s when the splat param is missing', async () => {
	await expect(callLoader(undefined)).rejects.toMatchObject({ status: 404 })
})
