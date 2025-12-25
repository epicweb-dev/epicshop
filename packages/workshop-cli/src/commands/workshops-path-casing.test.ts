import { afterEach, beforeEach, expect, test, vi } from 'vitest'

vi.mock('@epic-web/workshop-utils/workshops.server', () => {
	return {
		isReposDirectoryConfigured: vi.fn(async () => true),
		getReposDirectory: vi.fn(async () => '/repos'),
		workshopExists: vi.fn(async () => true),
		getWorkshop: vi.fn(async () => ({
			name: 'react-fundamentals',
			title: 'React Fundamentals',
			repoName: 'react-fundamentals',
			path: '/repos/react-fundamentals',
		})),
	}
})

// Keep console clean and capture output for assertions
beforeEach(() => {
	vi.spyOn(console, 'log').mockImplementation(() => {})
	vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
	vi.restoreAllMocks()
})

function stripAnsi(input: string): string {
	return input.replace(/\x1B\[[0-9;]*m/g, '')
}

test('add prints the actual workshop path when repoName casing differs', async () => {
	const { add } = await import('./workshops.ts')

	const result = await add({ repoName: 'REACT-FUNDAMENTALS', silent: false })

	expect(result).toMatchObject({
		success: false,
		message: 'Workshop "REACT-FUNDAMENTALS" already exists',
	})

	const logCalls = vi.mocked(console.log).mock.calls
	const printed = stripAnsi(logCalls.map((c) => String(c[0])).join('\n'))

	expect(printed).toContain('Location on disk: /repos/react-fundamentals')
	expect(printed).not.toContain('Location on disk: /repos/REACT-FUNDAMENTALS')
})

