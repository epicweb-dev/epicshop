import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { expect, test, vi } from 'vitest'

import { setVideos } from './set-videos.ts'

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
}: {
	productHost?: string
	productSlug?: string
} = {}) {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'epicshop-set-videos-'))

	const workshopReadmePath = path.join(root, 'exercises', 'README.mdx')
	const workshopFinishedPath = path.join(root, 'exercises', 'FINISHED.mdx')
	const exerciseRoot = path.join(root, 'exercises', '01.first-exercise')
	const exerciseReadmePath = path.join(exerciseRoot, 'README.mdx')
	const exerciseFinishedPath = path.join(exerciseRoot, 'FINISHED.mdx')
	const problemReadmePath = path.join(exerciseRoot, '01.problem', 'README.mdx')
	const solutionReadmePath = path.join(
		exerciseRoot,
		'01.solution',
		'README.mdx',
	)

	await writeJson(path.join(root, 'package.json'), {
		name: 'test-workshop',
		private: true,
		epicshop: {
			title: 'Test Workshop',
			githubRoot: 'https://github.com/example/test-workshop/tree/main',
			product: {
				host: productHost,
				slug: productSlug,
			},
		},
	})

	await writeFile(
		workshopReadmePath,
		`# Workshop Intro

Welcome to the workshop.
`,
	)
	await writeFile(
		workshopFinishedPath,
		`# Workshop Wrap Up

<EpicVideo url="https://old.example/workshop-wrap-up" />

Thanks for watching.
`,
	)
	await writeFile(
		exerciseReadmePath,
		`# Exercise Intro

<EpicVideo url="https://old.example/exercise-intro" />

Some intro text.

<EpicVideo url="https://keep.example/extra-exercise-video" />
`,
	)
	await writeFile(
		exerciseFinishedPath,
		`# Exercise Summary

Final notes.
`,
	)
	await writeFile(
		problemReadmePath,
		`# Step Problem

Read this problem description first.

<EpicVideo url="https://keep.example/problem-extra-video" />
`,
	)
	await writeFile(
		solutionReadmePath,
		`# Step Solution

<EpicVideo url="https://old.example/step-solution" />

Here is the solution.
`,
	)

	return {
		root,
		paths: {
			workshopReadmePath,
			workshopFinishedPath,
			exerciseReadmePath,
			exerciseFinishedPath,
			problemReadmePath,
			solutionReadmePath,
		},
		async [Symbol.asyncDispose]() {
			await fs.rm(root, { recursive: true, force: true })
		},
	}
}

function mockProductWorkshopResponse({
	productHost = 'www.epicweb.dev',
	productSlug = 'test-workshop',
	remoteLessons,
}: {
	productHost?: string
	productSlug?: string
	remoteLessons: Array<{
		type: 'lesson' | 'section'
		slug: string
		lessons?: Array<{ slug: string }>
	}>
}) {
	const resources = remoteLessons.map((lesson) => {
		if (lesson.type === 'lesson') {
			return {
				_type: 'lesson',
				_id: lesson.slug,
				slug: lesson.slug,
			}
		}
		return {
			_type: 'section',
			_id: lesson.slug,
			slug: lesson.slug,
			lessons: (lesson.lessons ?? []).map((nested) => ({
				_type: 'lesson',
				_id: nested.slug,
				slug: nested.slug,
			})),
		}
	})

	vi.stubGlobal(
		'fetch',
		vi.fn(async (input: string | URL | Request) => {
			const url = String(input)
			const expected = `https://${productHost}/api/workshops/${productSlug}`
			if (url === expected) {
				return new Response(JSON.stringify({ resources }), { status: 200 })
			}
			return new Response('Not Found', { status: 404 })
		}),
	)
}

test('maps product lesson order to files and only updates top EpicVideo under title', async () => {
	await using fixture = await createWorkshopFixture()
	const { root, paths } = fixture

	mockProductWorkshopResponse({
		remoteLessons: [
			{ type: 'lesson', slug: 'workshop-intro' },
			{
				type: 'section',
				slug: 'first-section',
				lessons: [
					{ slug: 'exercise-intro' },
					{ slug: 'step-problem' },
					{ slug: 'exercise-summary' },
				],
			},
			{ type: 'lesson', slug: 'workshop-wrap-up' },
		],
	})

	const result = await setVideos({ workshopRoot: root, silent: true })
	expect(result.success).toBe(true)
	expect(result.dryRun).toBe(false)
	expect(result.inserted).toBe(3)
	expect(result.updated).toBe(3)
	expect(result.unchanged).toBe(0)
	expect(result.warnings).toHaveLength(0)

	const workshopReadme = await fs.readFile(paths.workshopReadmePath, 'utf8')
	expect(workshopReadme).toContain(
		'<EpicVideo url="https://www.epicweb.dev/workshops/test-workshop/workshop-intro" />',
	)
	expect(workshopReadme).toMatch(
		/^# Workshop Intro\n\n<EpicVideo url="https:\/\/www\.epicweb\.dev\/workshops\/test-workshop\/workshop-intro" \/>/m,
	)

	const exerciseReadme = await fs.readFile(paths.exerciseReadmePath, 'utf8')
	expect(exerciseReadme).toContain(
		'<EpicVideo url="https://www.epicweb.dev/workshops/test-workshop/first-section/exercise-intro" />',
	)
	expect(exerciseReadme).toContain(
		'<EpicVideo url="https://keep.example/extra-exercise-video" />',
	)

	const problemReadme = await fs.readFile(paths.problemReadmePath, 'utf8')
	expect(problemReadme).toContain(
		'<EpicVideo url="https://www.epicweb.dev/workshops/test-workshop/first-section/step-problem" />',
	)
	expect(problemReadme).toContain(
		'<EpicVideo url="https://keep.example/problem-extra-video" />',
	)
	expect(problemReadme).toMatch(
		/^# Step Problem\n\n<EpicVideo url="https:\/\/www\.epicweb\.dev\/workshops\/test-workshop\/first-section\/step-problem" \/>/m,
	)

	const solutionReadme = await fs.readFile(paths.solutionReadmePath, 'utf8')
	expect(solutionReadme).toContain(
		'<EpicVideo url="https://www.epicweb.dev/workshops/test-workshop/first-section/step-problem" />',
	)

	const exerciseFinished = await fs.readFile(paths.exerciseFinishedPath, 'utf8')
	expect(exerciseFinished).toContain(
		'<EpicVideo url="https://www.epicweb.dev/workshops/test-workshop/first-section/exercise-summary" />',
	)

	const workshopFinished = await fs.readFile(paths.workshopFinishedPath, 'utf8')
	expect(workshopFinished).toContain(
		'<EpicVideo url="https://www.epicweb.dev/workshops/test-workshop/workshop-wrap-up" />',
	)
})

test('dry-run reports updates but does not write files', async () => {
	await using fixture = await createWorkshopFixture()
	const { root, paths } = fixture

	mockProductWorkshopResponse({
		remoteLessons: [
			{ type: 'lesson', slug: 'workshop-intro' },
			{
				type: 'section',
				slug: 'first-section',
				lessons: [
					{ slug: 'exercise-intro' },
					{ slug: 'step-problem' },
					{ slug: 'exercise-summary' },
				],
			},
			{ type: 'lesson', slug: 'workshop-wrap-up' },
		],
	})

	const before = {
		workshopReadme: await fs.readFile(paths.workshopReadmePath, 'utf8'),
		workshopFinished: await fs.readFile(paths.workshopFinishedPath, 'utf8'),
		exerciseReadme: await fs.readFile(paths.exerciseReadmePath, 'utf8'),
		exerciseFinished: await fs.readFile(paths.exerciseFinishedPath, 'utf8'),
		problemReadme: await fs.readFile(paths.problemReadmePath, 'utf8'),
		solutionReadme: await fs.readFile(paths.solutionReadmePath, 'utf8'),
	}

	const result = await setVideos({
		workshopRoot: root,
		silent: true,
		dryRun: true,
	})
	expect(result.success).toBe(true)
	expect(result.dryRun).toBe(true)
	expect(result.message).toContain('dry run')
	expect(result.inserted).toBe(3)
	expect(result.updated).toBe(3)
	expect(result.unchanged).toBe(0)

	const after = {
		workshopReadme: await fs.readFile(paths.workshopReadmePath, 'utf8'),
		workshopFinished: await fs.readFile(paths.workshopFinishedPath, 'utf8'),
		exerciseReadme: await fs.readFile(paths.exerciseReadmePath, 'utf8'),
		exerciseFinished: await fs.readFile(paths.exerciseFinishedPath, 'utf8'),
		problemReadme: await fs.readFile(paths.problemReadmePath, 'utf8'),
		solutionReadme: await fs.readFile(paths.solutionReadmePath, 'utf8'),
	}

	expect(after).toEqual(before)
})

test('fails when product lessons are fewer than required files and applies no edits', async () => {
	await using fixture = await createWorkshopFixture()
	const { root, paths } = fixture

	mockProductWorkshopResponse({
		remoteLessons: [
			{ type: 'lesson', slug: 'workshop-intro' },
			{
				type: 'section',
				slug: 'first-section',
				lessons: [{ slug: 'exercise-intro' }],
			},
		],
	})

	const beforeWorkshopReadme = await fs.readFile(
		paths.workshopReadmePath,
		'utf8',
	)
	const beforeExerciseReadme = await fs.readFile(
		paths.exerciseReadmePath,
		'utf8',
	)

	const result = await setVideos({ workshopRoot: root, silent: true })
	expect(result.success).toBe(false)
	expect(result.dryRun).toBe(false)
	expect(result.message).toContain(
		'Not enough product lessons to map onto workshop files',
	)
	expect(result.message).toContain('Assigned file/video pairs (in order):')
	expect(result.message).toContain('Unassigned local files (in order):')
	expect(result.message).toContain(
		'Product lessons returned by API (in order):',
	)
	expect(result.message).toContain('Required local files (in order):')
	expect(result.message).toContain(
		'1. exercises/README.mdx -> https://www.epicweb.dev/workshops/test-workshop/workshop-intro',
	)
	expect(result.message).toContain(
		'2. exercises/01.first-exercise/README.mdx -> https://www.epicweb.dev/workshops/test-workshop/first-section/exercise-intro',
	)
	expect(result.message).toContain(
		'3. exercises/01.first-exercise/01.problem/README.mdx',
	)

	const afterWorkshopReadme = await fs.readFile(
		paths.workshopReadmePath,
		'utf8',
	)
	const afterExerciseReadme = await fs.readFile(
		paths.exerciseReadmePath,
		'utf8',
	)
	expect(afterWorkshopReadme).toBe(beforeWorkshopReadme)
	expect(afterExerciseReadme).toBe(beforeExerciseReadme)
})

test('prints failure details when set-videos fails and silent is false', async () => {
	await using fixture = await createWorkshopFixture()
	const { root } = fixture

	mockProductWorkshopResponse({
		remoteLessons: [
			{ type: 'lesson', slug: 'workshop-intro' },
			{
				type: 'section',
				slug: 'first-section',
				lessons: [{ slug: 'exercise-intro' }],
			},
		],
	})

	const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

	const result = await setVideos({ workshopRoot: root, silent: false })
	expect(result.success).toBe(false)
	const output = logSpy.mock.calls.map((call) => call.join(' ')).join('\n')
	expect(output).toContain('Admin: Set videos')
	expect(output).toContain(
		'Not enough product lessons to map onto workshop files',
	)
	expect(output).toContain('Product lessons returned by API (in order):')
})
