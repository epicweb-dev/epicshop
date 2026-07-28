import {
	isRouteErrorResponse,
	UNSAFE_ErrorResponseImpl as ErrorResponseImpl,
} from 'react-router'
import { expect, test } from 'vitest'
import { isClientErrorResponse } from '../app/utils/route-errors.ts'

test('treats a 405 route error response as a client error (react-router answers it with a 405, so it is not a server fault)', () => {
	const error = new ErrorResponseImpl(
		405,
		'Method Not Allowed',
		new Error(
			'You made a POST request to "/" but did not provide an `action` for route "root", so there is no way to handle the request.',
		),
		true,
	)

	expect(isRouteErrorResponse(error)).toBe(true)
	expect(isClientErrorResponse(error)).toBe(true)
})

test('treats a 404 route error response as a client error (react-router answers it with a 404, so it is not a server fault)', () => {
	const error = new ErrorResponseImpl(
		404,
		'Not Found',
		new Error('No route matches URL "/.env%0d%0a"'),
		true,
	)

	expect(isRouteErrorResponse(error)).toBe(true)
	expect(isClientErrorResponse(error)).toBe(true)
})

test('treats a 400 route error response as a client error (react-router answers it with a 400, so it is not a server fault)', () => {
	const error = new ErrorResponseImpl(
		400,
		'Bad Request',
		new Error(
			'You made a GET request to "/resource" but did not provide a `loader` for route "resource", so there is no way to handle the request.',
		),
		true,
	)

	expect(isRouteErrorResponse(error)).toBe(true)
	expect(isClientErrorResponse(error)).toBe(true)
})

test('does not treat a 500 route error response as a client error (server faults must keep reporting)', () => {
	const error = new ErrorResponseImpl(
		500,
		'Internal Server Error',
		new Error('boom'),
		true,
	)

	expect(isRouteErrorResponse(error)).toBe(true)
	expect(isClientErrorResponse(error)).toBe(false)
})

test('does not treat an unrelated plain Error as a client error response', () => {
	expect(isClientErrorResponse(new Error('boom'))).toBe(false)
})

test('treats React Router CSRF Error("Bad Request") as a client error (aha)', () => {
	// singleFetchAction catches the descriptive origin-mismatch error and
	// reports this bare message through handleError while returning HTTP 400.
	expect(isClientErrorResponse(new Error('Bad Request'))).toBe(true)
})

test('treats React Router document-request CSRF abort Errors as client errors (aha)', () => {
	// handleDocumentRequest passes the descriptive throwIfPotentialCSRFAttack
	// Error into handleError before returning HTTP 400 (EPICSHOP-HB).
	expect(
		isClientErrorResponse(
			new Error('`origin` header is not a valid URL. Aborting the action.'),
		),
	).toBe(true)
	expect(
		isClientErrorResponse(
			new Error(
				'host header does not match `origin` header from a forwarded action request. Aborting the action.',
			),
		),
	).toBe(true)
	expect(
		isClientErrorResponse(
			new Error(
				'x-forwarded-host header does not match `origin` header from a forwarded action request. Aborting the action.',
			),
		),
	).toBe(true)
	expect(
		isClientErrorResponse(
			new Error(
				'`x-forwarded-host` or `host` headers are not provided. One of these is needed to compare the `origin` header from a forwarded action request. Aborting the action.',
			),
		),
	).toBe(true)
})

test('does not treat unrelated Aborting-the-action text as a client CSRF error', () => {
	expect(
		isClientErrorResponse(
			new Error('Something went wrong. Aborting the action.'),
		),
	).toBe(false)
})

test('does not treat null or undefined as a client error response', () => {
	expect(isClientErrorResponse(null)).toBe(false)
	expect(isClientErrorResponse(undefined)).toBe(false)
})
