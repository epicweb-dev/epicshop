import { expect, test } from 'vitest'
import {
	assertNoUnexpandedShellVariable,
	findUnexpandedShellVariable,
} from './mcp-arg-validation.ts'
import { ExpectedMcpError } from './sentry-filters.ts'

test('detects positional shell placeholders as whole values (aha)', () => {
	expect(findUnexpandedShellVariable('$1')).toBe('$1')
	expect(findUnexpandedShellVariable('$2')).toBe('$2')
	expect(findUnexpandedShellVariable('${1}')).toBe('${1}')
})

test('detects unexpanded shell placeholders in path segments (aha)', () => {
	expect(
		findUnexpandedShellVariable('/home/sekou/Dev/ia-vocal-note-app/$1'),
	).toBe('$1')
	expect(
		findUnexpandedShellVariable('/Users/hirotaka/Workspaces/pragmatic-nuxt/$1'),
	).toBe('$1')
	expect(findUnexpandedShellVariable('C:\\workshops\\$WORKSHOP_DIR')).toBe(
		'$WORKSHOP_DIR',
	)
})

test('does not flag ordinary paths that happen to include a dollar sign later', () => {
	expect(findUnexpandedShellVariable('/home/user/workshop')).toBeNull()
	expect(findUnexpandedShellVariable('/tmp/price$tag-workshop')).toBeNull()
	expect(findUnexpandedShellVariable('4')).toBeNull()
})

test('assertNoUnexpandedShellVariable throws ExpectedMcpError with guidance (aha)', () => {
	expect(() =>
		assertNoUnexpandedShellVariable(
			'workshopDirectory',
			'/home/sekou/Dev/ia-vocal-note-app/$1',
		),
	).toThrow(ExpectedMcpError)
	expect(() =>
		assertNoUnexpandedShellVariable(
			'workshopDirectory',
			'/home/sekou/Dev/ia-vocal-note-app/$1',
		),
	).toThrow(/unexpanded shell variable.*"\$1"/i)
	expect(() =>
		assertNoUnexpandedShellVariable(
			'workshopDirectory',
			'/home/sekou/Dev/ia-vocal-note-app/$1',
		),
	).toThrow(/MCP server config/i)
})
