import { type Request, type Response } from 'express'
import { expect, test, vi } from 'vitest'
import {
	alignLoopbackOriginHeaders,
	getOriginHost,
	isLoopbackHost,
	shouldAlignLoopbackOriginHeaders,
} from '../server/align-loopback-origin.ts'

test('recognizes loopback hosts with and without ports (aha)', () => {
	expect(isLoopbackHost('localhost')).toBe(true)
	expect(isLoopbackHost('localhost:5639')).toBe(true)
	expect(isLoopbackHost('127.0.0.1:5639')).toBe(true)
	expect(isLoopbackHost('[::1]:5639')).toBe(true)
	expect(isLoopbackHost('example.com')).toBe(false)
	expect(
		isLoopbackHost('literate-lamp-975vggxqvvhp4jx-5639.app.github.dev'),
	).toBe(false)
})

test('parses Origin hosts and rejects invalid values', () => {
	expect(getOriginHost('http://localhost:5639')).toBe('localhost:5639')
	expect(getOriginHost('https://127.0.0.1:5639')).toBe('127.0.0.1:5639')
	expect(getOriginHost('null')).toBeNull()
	expect(getOriginHost(undefined)).toBeNull()
	expect(getOriginHost('not-a-url')).toBeNull()
})

test('aligns when Codespaces rewrites Origin to localhost but X-Forwarded-Host stays public (aha)', () => {
	expect(
		shouldAlignLoopbackOriginHeaders({
			deployed: false,
			originHost: 'localhost:5639',
			hostHeader: 'localhost:5639',
			forwardedHostHeader: 'literate-lamp-975vggxqvvhp4jx-5639.app.github.dev',
		}),
	).toBe(true)
})

test('aligns localhost vs 127.0.0.1 Host mismatches on undeployed workshops', () => {
	expect(
		shouldAlignLoopbackOriginHeaders({
			deployed: false,
			originHost: '127.0.0.1:5639',
			hostHeader: 'localhost:5639',
			forwardedHostHeader: undefined,
		}),
	).toBe(true)
})

test('does not align deployed workshops (keep strict CSRF proxy behavior)', () => {
	expect(
		shouldAlignLoopbackOriginHeaders({
			deployed: true,
			originHost: 'localhost:5639',
			hostHeader: 'localhost:5639',
			forwardedHostHeader: 'workshop.example.com',
		}),
	).toBe(false)
})

test('does not align cross-site scanner Origins', () => {
	expect(
		shouldAlignLoopbackOriginHeaders({
			deployed: false,
			originHost: 'www.flixbus.com',
			hostHeader: 'localhost:5639',
			forwardedHostHeader: 'literate-lamp-975vggxqvvhp4jx-5639.app.github.dev',
		}),
	).toBe(false)
})

test('does not align when Origin already matches Host and there is no forwarded host', () => {
	expect(
		shouldAlignLoopbackOriginHeaders({
			deployed: false,
			originHost: 'localhost:5639',
			hostHeader: 'localhost:5639',
			forwardedHostHeader: undefined,
		}),
	).toBe(false)
})

test('middleware rewrites Host and drops X-Forwarded-Host for Codespaces loopback Origin', () => {
	vi.stubGlobal('ENV', { EPICSHOP_DEPLOYED: false })
	const req = {
		headers: {
			origin: 'http://localhost:5639',
			host: 'localhost:5639',
			'x-forwarded-host': 'literate-lamp-975vggxqvvhp4jx-5639.app.github.dev',
		},
	} as unknown as Request
	const next = vi.fn()

	alignLoopbackOriginHeaders(req, {} as Response, next)

	expect(req.headers.host).toBe('localhost:5639')
	expect(req.headers['x-forwarded-host']).toBeUndefined()
	expect(next).toHaveBeenCalledOnce()
	vi.unstubAllGlobals()
})

test('middleware leaves scanner requests untouched', () => {
	vi.stubGlobal('ENV', { EPICSHOP_DEPLOYED: false })
	const req = {
		headers: {
			origin: 'https://www.flixbus.com',
			host: 'localhost:5639',
			'x-forwarded-host': 'literate-lamp-975vggxqvvhp4jx-5639.app.github.dev',
		},
	} as unknown as Request
	const next = vi.fn()

	alignLoopbackOriginHeaders(req, {} as Response, next)

	expect(req.headers.host).toBe('localhost:5639')
	expect(req.headers['x-forwarded-host']).toBe(
		'literate-lamp-975vggxqvvhp4jx-5639.app.github.dev',
	)
	expect(next).toHaveBeenCalledOnce()
	vi.unstubAllGlobals()
})
