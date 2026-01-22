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

const { add, startWorkshop } = await import('./workshops.ts')

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
