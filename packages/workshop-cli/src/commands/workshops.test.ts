import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('execa', () => ({
	execa: vi.fn(),
}))

const { execa } = await import('execa')

const { add } = await import('./workshops.ts')

describe('workshops add', () => {
	it('passes a clone destination containing spaces as a single argument', async () => {
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
})

