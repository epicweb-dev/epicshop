import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { expect, test, vi } from 'vitest'

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

	return {
		root,
		async [Symbol.asyncDispose]() {
			await fs.rm(root, { recursive: true, force: true })
		},
	}
}

test('passes with configured product + videos (skip remote)', async () => {
	await using workshop = await createWorkshopFixture()

	await expect(
		launchReadiness({
			workshopRoot: workshop.root,
			silent: true,
			skipRemote: true,
			skipHead: true,
		}),
	).resolves.toEqual(expect.objectContaining({ success: true }))
})

test('fails when epicshop.product.slug missing', async () => {
	await using workshop = await createWorkshopFixture({
		includeProductSlug: false,
	})

	await expect(
		launchReadiness({
			workshopRoot: workshop.root,
			silent: true,
			skipRemote: true,
			skipHead: true,
		}),
	).resolves.toEqual(expect.objectContaining({ success: false }))
})

test('fails when a required MDX file has no EpicVideo embed (and prints helpful path)', async () => {
	await using workshop = await createWorkshopFixture()

	// Remove the EpicVideo embed from the step problem README.
	await writeFile(
		path.join(
			workshop.root,
			'exercises',
			'01.first-exercise',
			'01.problem',
			'README.mdx',
		),
		`# Step Problem\n\nNo video yet.\n`,
	)

	const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

	const result = await launchReadiness({
		workshopRoot: workshop.root,
		silent: false,
		skipRemote: true,
		skipHead: true,
	})

	expect(result.success).toBe(false)
	const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n')
	expect(output).toContain('No <EpicVideo url="..."> embed found')
	expect(output).toContain('exercises/01.first-exercise/01.problem/README.mdx')
})

test('remote lesson check fails when product lesson slug not represented locally', async () => {
	const productHost = 'www.epicweb.dev'
	const productSlug = 'test-workshop'
	await using workshop = await createWorkshopFixture({
		productHost,
		productSlug,
	})

	vi.stubGlobal(
		'fetch',
		vi.fn(async () => {
			return new Response(
				JSON.stringify({
					resources: [
						{ _type: 'lesson', _id: '1', slug: 'workshop-intro' },
						{
							_type: 'section',
							_id: 's1',
							slug: 'functions-section',
							lessons: [{ _type: 'lesson', _id: '2', slug: 'missing-lesson' }],
						},
					],
				}),
				{ status: 200 },
			)
		}),
	)

	const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

	const result = await launchReadiness({
		workshopRoot: workshop.root,
		silent: false,
		skipRemote: false,
		skipHead: true,
	})

	expect(result.success).toBe(false)
	const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n')
	expect(output).toContain('Missing videos in workshop for product lessons:')
	expect(output).toContain('missing-lesson')
	expect(output).toContain(
		`https://${productHost}/workshops/${productSlug}/functions-section/missing-lesson`,
	)
})

test('warns about extra embeds only for configured workshop (includes offending url + file)', async () => {
	const productHost = 'www.epicweb.dev'
	const productSlug = 'test-workshop'
	await using workshop = await createWorkshopFixture({
		productHost,
		productSlug,
	})

	// Add an extra embed for this workshop (should warn) and one outside /workshops (should not).
	const exerciseIntroPath = path.join(
		workshop.root,
		'exercises',
		'01.first-exercise',
		'README.mdx',
	)
	await writeFile(
		exerciseIntroPath,
		`# Exercise Intro

<EpicVideo url="https://${productHost}/workshops/${productSlug}/exercise-intro" />
<EpicVideo url="https://${productHost}/workshops/${productSlug}/extra-lesson" />
<EpicVideo url="https://${productHost}/blog/some-post" />
`,
	)

	vi.stubGlobal(
		'fetch',
		vi.fn(async () => {
			return new Response(
				JSON.stringify({
					resources: [
						{ _type: 'lesson', _id: '1', slug: 'workshop-intro' },
						{ _type: 'lesson', _id: '2', slug: 'workshop-wrap-up' },
						{ _type: 'lesson', _id: '3', slug: 'exercise-intro' },
						{ _type: 'lesson', _id: '4', slug: 'exercise-summary' },
						{ _type: 'lesson', _id: '5', slug: 'step-problem' },
						{ _type: 'lesson', _id: '6', slug: 'step-solution' },
					],
				}),
				{ status: 200 },
			)
		}),
	)

	const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

	const result = await launchReadiness({
		workshopRoot: workshop.root,
		silent: false,
		skipRemote: false,
		skipHead: true,
	})

	expect(result.success).toBe(true)
	const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n')
	expect(output).toContain(
		`EpicVideo embed not present in the product lesson list: https://${productHost}/workshops/${productSlug}/extra-lesson`,
	)
	expect(output).toContain('exercises/01.first-exercise/README.mdx')
	expect(output).not.toContain('some-post')
})

test('fails when a required FINISHED.mdx is too short', async () => {
	await using workshop = await createWorkshopFixture()

	await writeFile(
		path.join(workshop.root, 'exercises', '01.first-exercise', 'FINISHED.mdx'),
		`Short.\n`,
	)

	const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

	const result = await launchReadiness({
		workshopRoot: workshop.root,
		silent: false,
		skipRemote: true,
		skipHead: true,
	})
	expect(result.success).toBe(false)
	const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n')
	expect(output).toContain('File content too short')
	expect(output).toContain('exercises/01.first-exercise/FINISHED.mdx')
})

test('fails when an EpicVideo url does not return 200 to HEAD', async () => {
	await using workshop = await createWorkshopFixture()

	vi.stubGlobal(
		'fetch',
		vi.fn(async (input: any, init?: any) => {
			const url = typeof input === 'string' ? input : String(input)
			if (init?.method === 'HEAD' && url.includes('step-problem')) {
				return new Response(null, { status: 404, statusText: 'Not Found' })
			}
			return new Response(null, { status: 200, statusText: 'OK' })
		}),
	)

	await expect(
		launchReadiness({
			workshopRoot: workshop.root,
			silent: true,
			skipRemote: true,
			skipHead: false,
		}),
	).resolves.toEqual(expect.objectContaining({ success: false }))
})
