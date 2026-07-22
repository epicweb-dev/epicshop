import { expect, test } from 'vitest'
import {
	ExpectedMcpError,
	isExpectedMcpErrorMessage,
	isExpectedMcpSentryNoise,
} from './sentry-filters.ts'

test('ExpectedMcpError uses a stable name for Sentry typing (aha)', () => {
	const error = new ExpectedMcpError('The workshop directory is required')
	expect(error.name).toBe('ExpectedMcpError')
	expect(error).toBeInstanceOf(Error)
})

test('matches no-workshop-directory messages', () => {
	expect(
		isExpectedMcpErrorMessage(
			'No workshop directory found while searching upward from "/tmp/foo" to filesystem root "/"',
		),
	).toBe(true)
})

test('matches required workshop directory messages', () => {
	expect(isExpectedMcpErrorMessage('The workshop directory is required')).toBe(
		true,
	)
})

test('does not match unrelated errors', () => {
	expect(isExpectedMcpErrorMessage('Cannot find package zod')).toBe(false)
})

test('drops ExpectedMcpError via originalException hint', () => {
	expect(
		isExpectedMcpSentryNoise(
			{ exception: { values: [] } },
			{
				originalException: new ExpectedMcpError(
					'The workshop directory is required',
				),
			},
		),
	).toBe(true)
})

test('drops ExpectedMcpError exception type from event payload', () => {
	expect(
		isExpectedMcpSentryNoise({
			exception: {
				values: [
					{
						type: 'ExpectedMcpError',
						value: 'The workshop directory is required',
					},
				],
			},
		}),
	).toBe(true)
})

test('drops JsonRpcError events that wrap expected workshop messages (aha)', () => {
	expect(
		isExpectedMcpSentryNoise({
			exception: {
				values: [
					{
						type: 'JsonRpcError_-32603',
						value:
							'No workshop directory found while searching upward from "/Users/hirotaka/Workspaces/github.com/hirotaka/pragmatic-nuxt/$1" to filesystem root "/"',
					},
				],
			},
		}),
	).toBe(true)
})

test('keeps unrelated JsonRpcError events', () => {
	expect(
		isExpectedMcpSentryNoise({
			exception: {
				values: [
					{
						type: 'JsonRpcError_-32603',
						value: 'Unexpected internal failure in get_diff',
					},
				],
			},
		}),
	).toBe(false)
})
