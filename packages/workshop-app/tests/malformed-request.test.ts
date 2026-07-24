import { type Request, type Response } from 'express'
import { expect, test, vi } from 'vitest'
import {
	getMalformedRequestReason,
	rejectMalformedRequests,
} from '../server/malformed-request.ts'

test('rejects /%5C because react-router decodes it to a backslash and encodeLocation new URL throws during SSR (aha)', () => {
	expect(getMalformedRequestReason('/%5C')).toBe('backslash in path')
})

test('rejects //.env%00 because decoded path has a NUL that cannot go in a header (aha)', () => {
	expect(getMalformedRequestReason('//.env%00')).toBe(
		'control characters in path',
	)
})

test('rejects /.env%0d%0a because CR/LF in the path enable header injection (aha)', () => {
	expect(getMalformedRequestReason('/.env%0d%0a')).toBe(
		'control characters in path',
	)
})

test('rejects //foo because react-router treats protocol-relative paths as absolute URLs and new URL throws (aha)', () => {
	expect(getMalformedRequestReason('//foo')).toBe('protocol-relative path')
})

test('rejects /%zz because decodeURIComponent throws URIError (aha)', () => {
	expect(getMalformedRequestReason('/%zz')).toBe('undecodable percent-encoding')
})

test('accepts the root path', () => {
	expect(getMalformedRequestReason('/')).toBeNull()
})

test('accepts a normal exercise path', () => {
	expect(getMalformedRequestReason('/exercise/01/01/problem')).toBeNull()
})

test('accepts a playground API path', () => {
	expect(
		getMalformedRequestReason('/app/playground/api/create-ship'),
	).toBeNull()
})

test('accepts a resources lookout path', () => {
	expect(getMalformedRequestReason('/resources/lookout')).toBeNull()
})

test('accepts a path with a legit encoded space', () => {
	expect(getMalformedRequestReason('/a%20b')).toBeNull()
})

test('accepts query strings that contain // and %5C because only the path is inspected (aha)', () => {
	expect(getMalformedRequestReason('/search?q=a%5Cb&next=//x')).toBeNull()
})

function callMiddleware(url: string) {
	const sent: { status?: number; type?: string; body?: string } = {}
	const res = {
		status(code: number) {
			sent.status = code
			return res
		},
		type(value: string) {
			sent.type = value
			return res
		},
		send(body: string) {
			sent.body = body
			return res
		},
	}
	const next = vi.fn()

	rejectMalformedRequests({ url } as Request, res as unknown as Response, next)

	return { ...sent, nextCalls: next.mock.calls.length }
}

test('the middleware answers a malformed target with a 400 and stops the chain', () => {
	expect(callMiddleware('/%5C')).toEqual({
		status: 400,
		type: 'text/plain',
		body: 'Bad Request: backslash in path',
		nextCalls: 0,
	})
})

test('the middleware passes a routable target straight through untouched', () => {
	expect(callMiddleware('/exercise/01/01/problem')).toEqual({ nextCalls: 1 })
})
