import { expect, test, vi } from 'vitest'

vi.stubGlobal('ENV', { EPICSHOP_DEPLOYED: false })

const { LaunchSchema, action } = await import('../app/routes/launch-editor.tsx')

test('line "false" parses as undefined instead of NaN ZodError 500 (aha)', () => {
	expect(
		LaunchSchema.safeParse({
			type: 'appFile',
			appFile: ['src/index.ts'],
			appName: 'playground',
			file: '',
			line: 'false',
			column: '',
		}),
	).toEqual(
		expect.objectContaining({
			success: true,
			data: expect.objectContaining({
				line: undefined,
				column: undefined,
			}),
		}),
	)
})

test('empty line string is undefined, not coerced to 0 (aha)', () => {
	expect(
		LaunchSchema.safeParse({
			type: 'appFile',
			appFile: ['src/index.ts'],
			appName: 'playground',
			line: '',
		}),
	).toEqual(
		expect.objectContaining({
			success: true,
			data: expect.objectContaining({ line: undefined }),
		}),
	)
})

test('numeric line string becomes a number', () => {
	expect(
		LaunchSchema.safeParse({
			type: 'appFile',
			appFile: ['src/index.ts'],
			appName: 'playground',
			line: '42',
		}),
	).toEqual(
		expect.objectContaining({
			success: true,
			data: expect.objectContaining({ line: 42 }),
		}),
	)
})

test('non-numeric column is undefined, not a validation failure (aha)', () => {
	expect(
		LaunchSchema.safeParse({
			type: 'appFile',
			appFile: ['src/index.ts'],
			appName: 'playground',
			column: 'abc',
		}),
	).toEqual(
		expect.objectContaining({
			success: true,
			data: expect.objectContaining({ column: undefined }),
		}),
	)
})

test('missing type still fails validation so junk cursor hints did not open the schema', () => {
	expect(
		LaunchSchema.safeParse({
			appFile: ['src/index.ts'],
			appName: 'playground',
			line: 'false',
		}).success,
	).toBe(false)
})

function submit(fields: Record<string, string>) {
	const request = new Request('http://localhost/launch-editor', {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams(fields),
	})
	return action({ request, params: {}, context: {} } as Parameters<
		typeof action
	>[0])
}

test('an unparseable launch form rejects with a 400 Response, not a ZodError (aha)', async () => {
	await expect(
		submit({ appFile: 'src/index.ts', appName: 'playground' }),
	).rejects.toMatchObject({ status: 400 })
})

test('the production payload that used to 500 now gets past validation (aha)', async () => {
	// Whatever the outcome, it has to be an HTTP response rather than a raw
	// ZodError escaping as an unhandled server fault.
	await expect(
		submit({
			appFile: 'src/index.ts',
			appName: 'playground',
			column: '',
			file: '',
			line: 'false',
			'show-progress-bar': 'true',
			type: 'appFile',
		}),
	).rejects.toBeInstanceOf(Response)
})
