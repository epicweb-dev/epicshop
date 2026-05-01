import { expect, test } from 'vitest'
import { toRedirectLocation } from '#app/utils/pe.tsx'

test('preserves already percent-encoded redirects', () => {
	expect(toRedirectLocation('/foo%20bar')).toBe('/foo%20bar')
})

test('encodes non-ascii redirects for location header compatibility', () => {
	expect(toRedirectLocation('/café')).toBe('/caf%C3%A9')
})

test('falls back for unsafe redirects', () => {
	expect(toRedirectLocation('https://example.com/foo%20bar')).toBe('/')
})

test('falls back when redirects cannot be encoded', () => {
	expect(toRedirectLocation('/\uD800')).toBe('/')
})
