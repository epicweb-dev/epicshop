import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, expect, test, vi } from 'vitest'

vi.mock('@epic-web/workshop-utils/compile-mdx.server', async () => {
	const fs = await import('node:fs/promises')
	return {
		compileMdx: vi.fn(async (file: string) => {
			const content = await fs.readFile(file, 'utf8').catch(() => '')
			const embeds = Array.from(
				content.matchAll(/<EpicVideo[^>]*\burl=["']([^"']+)["'][^>]*\/?>/g),
			)
				.map((m) => (m[1] ?? '').replace(/\/$/, ''))
				.filter(Boolean)
			return { code: '', title: null, epicVideoEmbeds: embeds }
		}),
	}
})

import { launchReadiness } from './launch-readiness.ts'

async function writeJson(filePath: string, value: unknown) {
	await fs.mkdir(path.dirname(filePath), { recursive: true })
	await fs.writeFile(filePath, JSON.stringify(value, null, 2))
}

async function writeFile(filePath: string, content: string) {
	await fs.mkdir(path.dirname(filePath), { recursive: true })
	await fs.writeFile(filePath, content)
}

async function createWorkshopFixture({
	productHost = 'www.epicweb.dev',
	productSlug = 'test-workshop',
	includeProductSlug = true,
}: {
	productHost?: string
	productSlug?: string
	includeProductSlug?: boolean
} = {}) {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'epicshop-launch-'))

	await writeJson(path.join(root, 'package.json'), {
		name: 'test-workshop',
		private: true,
		epicshop: {
			title: 'Test Workshop',
			githubRoot: 'https://github.com/example/test-workshop/tree/main',
			product: {
				host: productHost,
				...(includeProductSlug ? { slug: productSlug } : {}),
			},
		},
	})

	// Workshop intro + wrap-up
	await writeFile(
		path.join(root, 'exercises', 'README.mdx'),
		`# Workshop Intro\n\n<EpicVideo url="https://${productHost}/workshops/${productSlug}/workshop-intro" />\n`,
	)
	await writeFile(
		path.join(root, 'exercises', 'FINISHED.mdx'),
		`# Workshop Wrap Up\n\n<EpicVideo url="https://${productHost}/workshops/${productSlug}/workshop-wrap-up" />\n`,
	)

	// One exercise with one step
	const exRoot = path.join(root, 'exercises', '01.first-exercise')
	await writeFile(
		path.join(exRoot, 'README.mdx'),
		`# Exercise Intro\n\n<EpicVideo url="https://${productHost}/workshops/${productSlug}/exercise-intro" />\n`,
	)
	await writeFile(
		path.join(exRoot, 'FINISHED.mdx'),
		`# Exercise Summary\n\n<EpicVideo url="https://${productHost}/workshops/${productSlug}/exercise-summary" />\n`,
	)
	await writeFile(
		path.join(exRoot, '01.problem', 'README.mdx'),
		`# Step Problem\n\n<EpicVideo url="https://${productHost}/workshops/${productSlug}/step-problem" />\n`,
	)
	await writeFile(
		path.join(exRoot, '01.solution', 'README.mdx'),
		`# Step Solution\n\n<EpicVideo url="https://${productHost}/workshops/${productSlug}/step-solution" />\n`,
	)

	return root
}

afterEach(async () => {
	vi.unstubAllGlobals()
})

test('passes with configured product + videos (skip remote)', async () => {
	const workshopRoot = await createWorkshopFixture()

	try {
		await expect(
			launchReadiness({ workshopRoot, silent: true, skipRemote: true }),
		).resolves.toEqual(expect.objectContaining({ success: true }))
	} finally {
		await fs.rm(workshopRoot, { recursive: true, force: true })
	}
})

test('fails when epicshop.product.slug missing', async () => {
	const workshopRoot = await createWorkshopFixture({
		includeProductSlug: false,
	})

	try {
		await expect(
			launchReadiness({ workshopRoot, silent: true, skipRemote: true }),
		).resolves.toEqual(expect.objectContaining({ success: false }))
	} finally {
		await fs.rm(workshopRoot, { recursive: true, force: true })
	}
})

test('fails when a required MDX file has no EpicVideo embed (and prints helpful path)', async () => {
	const workshopRoot = await createWorkshopFixture()

	// Remove the EpicVideo embed from the step problem README.
	await writeFile(
		path.join(
			workshopRoot,
			'exercises',
			'01.first-exercise',
			'01.problem',
			'README.mdx',
		),
		`# Step Problem\n\nNo video yet.\n`,
	)

	const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

	try {
		const result = await launchReadiness({
			workshopRoot,
			silent: false,
			skipRemote: true,
		})

		expect(result.success).toBe(false)
		const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n')
		expect(output).toContain('No <EpicVideo url="..."> embed found')
		expect(output).toContain(
			'exercises/01.first-exercise/01.problem/README.mdx',
		)
	} finally {
		logSpy.mockRestore()
		await fs.rm(workshopRoot, { recursive: true, force: true })
	}
})

test('remote lesson check fails when product lesson slug not represented locally', async () => {
	const productHost = 'www.epicweb.dev'
	const productSlug = 'test-workshop'
	const workshopRoot = await createWorkshopFixture({ productHost, productSlug })

	vi.stubGlobal(
		'fetch',
		vi.fn(async () => {
			return new Response(
				JSON.stringify({
					resources: [
						{ _type: 'lesson', _id: '1', slug: 'workshop-intro' },
						{ _type: 'lesson', _id: '2', slug: 'missing-lesson' },
					],
				}),
				{ status: 200 },
			)
		}),
	)

	try {
		await expect(
			launchReadiness({ workshopRoot, silent: true, skipRemote: false }),
		).resolves.toEqual(expect.objectContaining({ success: false }))
	} finally {
		await fs.rm(workshopRoot, { recursive: true, force: true })
	}
})
