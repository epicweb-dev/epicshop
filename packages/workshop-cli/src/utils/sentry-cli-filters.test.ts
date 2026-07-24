import { expect, test } from 'vitest'
import { isExpectedCliSentryNoise } from './sentry-cli-filters.ts'

test('drops non-interactive TTY guard errors (aha)', () => {
	expect(
		isExpectedCliSentryNoise({
			exception: {
				values: [
					{
						type: 'Error',
						value: '❌ Non-interactive environment: no TTY detected.',
					},
				],
			},
		}),
	).toBe(true)
})

test('drops Ctrl-C ExitPromptError cancellations', () => {
	expect(
		isExpectedCliSentryNoise({
			exception: {
				values: [
					{
						type: 'ExitPromptError',
						value: 'User force closed the prompt with SIGINT',
					},
				],
			},
		}),
	).toBe(true)
})

test('drops unsupported Node styleText and broken local package installs', () => {
	expect(
		isExpectedCliSentryNoise({
			exception: {
				values: [
					{
						type: 'SyntaxError',
						value:
							"The requested module 'node:util' does not provide an export named 'styleText'",
					},
				],
			},
		}),
	).toBe(true)
	expect(
		isExpectedCliSentryNoise({
			exception: {
				values: [
					{
						type: 'Error',
						value:
							"Cannot find package 'zod' imported from /Users/cal/Library/pnpm/store/v11/links/@/epicshop/6.90.11/x",
					},
				],
			},
		}),
	).toBe(true)
})

test('keeps unrelated CLI errors', () => {
	expect(
		isExpectedCliSentryNoise({
			exception: {
				values: [{ type: 'Error', value: 'Failed to clone workshop repo' }],
			},
		}),
	).toBe(false)
})
