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

test('matches historical absolute-path validation messages', () => {
	expect(
		isExpectedMcpErrorMessage(
			'The workshop directory must be an absolute path',
		),
	).toBe(true)
})

test('matches unexpanded shell variable guidance messages', () => {
	expect(
		isExpectedMcpErrorMessage(
			'Received what looks like an unexpanded shell variable ("$1") for workshopDirectory (value: "/tmp/$1"). This usually means your MCP server config has a literal "$1" in args that the client never substituted. Replace it with a real value (an absolute path to the workshop root) instead of a shell placeholder.',
		),
	).toBe(true)
})

test('matches exercise number validation messages', () => {
	expect(
		isExpectedMcpErrorMessage(
			'Exercise number must be a number, received "$2".',
		),
	).toBe(true)
})

test('matches Electron-host JSON-RPC stdio corruption (aha)', () => {
	expect(
		isExpectedMcpErrorMessage(
			`Unexpected token 'E', " ELECTRON_R"... is not valid JSON`,
		),
	).toBe(true)
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

test('drops JsonRpcError events for historical absolute-path validation (aha)', () => {
	expect(
		isExpectedMcpSentryNoise({
			exception: {
				values: [
					{
						type: 'JsonRpcError_-32603',
						value: 'The workshop directory must be an absolute path',
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

test('drops MCP stdio deserialize ZodError transport noise (aha)', () => {
	expect(
		isExpectedMcpSentryNoise({
			culprit: 'deserializeMessage(@modelcontextprotocol.sdk.dist.esm.shared:stdio)',
			exception: {
				values: [
					{
						type: 'ZodError',
						value:
							'[\n  {\n    "code": "invalid_union",\n    "path": ["id"],\n    "message": "Invalid input"\n  }\n]',
						mechanism: {
							type: 'auto.ai.mcp_server',
							data: { error_type: 'transport' },
						},
					},
				],
			},
		}),
	).toBe(true)
})

test('drops ZodError when stack is deserializeMessage from MCP SDK stdio', () => {
	expect(
		isExpectedMcpSentryNoise({
			exception: {
				values: [
					{
						type: 'ZodError',
						value: '[\n  {\n    "code": "invalid_type"\n  }\n]',
						stacktrace: {
							frames: [
								{
									function: 'deserializeMessage',
									module: '@modelcontextprotocol.sdk.dist.esm.shared:stdio',
									filename:
										'/Users/example/.npm/_npx/x/node_modules/@modelcontextprotocol/sdk/dist/esm/shared/stdio.js',
								},
							],
						},
					},
				],
			},
		}),
	).toBe(true)
})

test('keeps unrelated ZodErrors outside MCP transport deserialize', () => {
	expect(
		isExpectedMcpSentryNoise({
			exception: {
				values: [
					{
						type: 'ZodError',
						value: '[\n  {\n    "code": "invalid_type",\n    "path": ["name"]\n  }\n]',
						mechanism: {
							type: 'generic',
							data: { error_type: 'tool' },
						},
						stacktrace: {
							frames: [
								{
									function: 'parseToolArgs',
									module: 'workshop-mcp/tools',
									filename: '/tmp/workshop-mcp/src/tools.ts',
								},
							],
						},
					},
				],
			},
		}),
	).toBe(false)
})
