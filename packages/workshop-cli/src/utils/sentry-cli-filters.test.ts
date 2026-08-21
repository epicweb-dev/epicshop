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

test('drops handled corrupted epicshop Cache JSON SyntaxErrors (EPICSHOP-HK aha)', () => {
	expect(
		isExpectedCliSentryNoise({
			tags: { error_type: 'corrupted_cache_file' },
			exception: {
				values: [
					{
						type: 'SyntaxError',
						value:
							'C:\\Users\\ankit\\AppData\\Local\\epicshop\\Cache\\67952d5900442ecda2c3142860f13b26\\EpicApiCache\\015b7b336203003c3edc0026304476bf: Unexpected token \'\u0000\', "\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000"... is not valid JSON',
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
						type: 'SyntaxError',
						value:
							'/Users/learner/Library/Caches/epicshop/abc/EpicApiCache/def: Unexpected token \'<\', "<html>"... is not valid JSON',
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
						type: 'SyntaxError',
						value:
							'/home/learner/.cache/epicshop/abc/DiscordCache/def: Unexpected token \'<\', "<html>"... is not valid JSON',
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
	expect(
		isExpectedCliSentryNoise({
			exception: {
				values: [
					{
						type: 'SyntaxError',
						value: 'Unexpected token } in JSON at position 12',
					},
				],
			},
		}),
	).toBe(false)
})
