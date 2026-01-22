import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { expect, test, vi } from 'vitest'

vi.mock('execa', () => ({
	execa: vi.fn(),
}))

vi.mock('./setup.js', () => ({
	setup: vi.fn(async () => ({ success: true })),
}))

vi.mock('@epic-web/workshop-utils/workshops.server', () => ({
	getDefaultReposDir: vi.fn(() => '/tmp/epicshop-workshops'),
	getReposDirectory: vi.fn(() => '/tmp/epicshop-workshops'),
	getWorkshop: vi.fn(),
	isReposDirectoryConfigured: vi.fn(async () => true),
	listWorkshops: vi.fn(async () => []),
	setReposDirectory: vi.fn(async () => {}),
	workshopExists: vi.fn(async () => false),
	verifyReposDirectory: vi.fn(async () => ({ accessible: true })),
}))

const { execa } = await import('execa')
const { githubCache } = await import('@epic-web/workshop-utils/cache.server')

const { add, startWorkshop, __test__ } = await import('./workshops.ts')

test('workshops add passes a clone destination containing spaces as a single argument (aha)', async () => {
	vi.mocked(execa).mockClear()
	vi.mocked(execa).mockResolvedValue({} as never)

	const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'epicshop user '))
	const directory = path.join(baseDir, 'workshops dir')

	try {
		const repoName = 'mcp-fundamentals'
		const result = await add({ repoName, directory, silent: true })

		expect(result.success).toBe(true)

		const repoUrl = `https://github.com/epicweb-dev/${repoName}.git`
		const reposDir = path.resolve(directory)
		const workshopPath = path.join(reposDir, repoName)

		expect(execa).toHaveBeenCalledWith(
			'git',
			['clone', repoUrl, workshopPath],
			expect.objectContaining({ cwd: reposDir }),
		)
	} finally {
		await fs.rm(baseDir, { recursive: true, force: true })
	}
})

test('workshops add treats destination as the full clone path', async () => {
	vi.mocked(execa).mockClear()
	vi.mocked(execa).mockResolvedValue({} as never)

	const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'epicshop user '))
	const destination = path.join(baseDir, 'custom-destination')

	try {
		const repoName = 'data-modeling'
		const result = await add({ repoName, destination, silent: true })

		expect(result.success).toBe(true)

		const repoUrl = `https://github.com/epicweb-dev/${repoName}.git`
		const reposDir = path.dirname(destination)

		expect(execa).toHaveBeenCalledWith(
			'git',
			['clone', repoUrl, destination],
			expect.objectContaining({ cwd: reposDir }),
		)
	} finally {
		await fs.rm(baseDir, { recursive: true, force: true })
	}
})

test('workshops add checks out a repo ref when provided (aha)', async () => {
	vi.mocked(execa).mockClear()
	vi.mocked(execa).mockResolvedValue({} as never)

	const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'epicshop user '))
	const directory = path.join(baseDir, 'workshops dir')

	try {
		const repoName = 'mcp-fundamentals'
		const repoRef = 'v1.2.3'
		const result = await add({
			repoName: `${repoName}#${repoRef}`,
			directory,
			silent: true,
		})

		expect(result.success).toBe(true)

		const repoUrl = `https://github.com/epicweb-dev/${repoName}.git`
		const reposDir = path.resolve(directory)
		const workshopPath = path.join(reposDir, repoName)

		expect(execa).toHaveBeenNthCalledWith(
			1,
			'git',
			['clone', repoUrl, workshopPath],
			expect.objectContaining({ cwd: reposDir }),
		)
		expect(execa).toHaveBeenNthCalledWith(
			2,
			'git',
			['checkout', repoRef],
			expect.objectContaining({ cwd: workshopPath }),
		)
	} finally {
		await fs.rm(baseDir, { recursive: true, force: true })
	}
})

test('workshops start treats Ctrl+C (signal termination) as success', async () => {
	const workshopDir = await fs.mkdtemp(
		path.join(os.tmpdir(), 'epicshop workshop '),
	)
	try {
		const { getWorkshop } =
			await import('@epic-web/workshop-utils/workshops.server')
		vi.mocked(getWorkshop).mockResolvedValue({
			title: 'Test Workshop',
			path: workshopDir,
			repoName: 'test-workshop',
		} as never)

		vi.mocked(execa).mockRejectedValue({ signal: 'SIGINT' })

		const result = await startWorkshop({
			workshop: 'test-workshop',
			silent: true,
		})
		expect(result.success).toBe(true)
	} finally {
		await fs.rm(workshopDir, { recursive: true, force: true })
	}
})

test('fetchWorkshopPackageJson falls back to GitHub API when raw fails (aha)', async () => {
	const fetchMock = vi.fn(async (url: string | URL) => {
		const urlString = String(url)
		if (urlString.includes('raw.githubusercontent.com')) {
			return new Response('Not Found', { status: 404 })
		}
		if (urlString.includes('api.github.com')) {
			return new Response(
				JSON.stringify({ epicshop: { title: 'Test Workshop' } }),
				{ status: 200, headers: { 'content-type': 'application/json' } },
			)
		}
		return new Response('Not Found', { status: 404 })
	})

	vi.stubGlobal('fetch', fetchMock)

	try {
		await githubCache.delete('github-package-json:test-workshop')

		const result = await __test__.fetchWorkshopPackageJson({
			name: 'test-workshop',
			default_branch: 'main',
		})

		expect(result?.epicshop).toEqual(
			expect.objectContaining({ title: 'Test Workshop' }),
		)
		expect(fetchMock).toHaveBeenCalled()
	} finally {
		vi.unstubAllGlobals()
	}
})
