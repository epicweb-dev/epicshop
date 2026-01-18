import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test, expect, vi } from 'vitest'
import {
	handleWorkshopDirectory,
	workshopDirectoryInputSchema,
} from './utils.ts'

vi.mock('@epic-web/workshop-utils/apps.server', () => ({
	getWorkshopRoot: vi.fn(() => '/mock/workshop'),
	init: vi.fn(async () => {}),
}))

async function createWorkshopFixture() {
	const root = await mkdtemp(path.join(os.tmpdir(), 'epicshop-workshop-'))
	const playgroundDir = path.join(root, 'playground')

	await mkdir(playgroundDir, { recursive: true })
	await writeFile(
		path.join(root, 'package.json'),
		JSON.stringify(
			{
				name: 'test-workshop',
				epicshop: {},
			},
			null,
			2,
		),
	)

	return {
		root,
		playgroundDir,
		async [Symbol.asyncDispose]() {
			await rm(root, { recursive: true, force: true })
		},
	}
}

async function createTempDir() {
	const root = await mkdtemp(path.join(os.tmpdir(), 'epicshop-empty-'))
	return {
		root,
		async [Symbol.asyncDispose]() {
			await rm(root, { recursive: true, force: true })
		},
	}
}

test('workshopDirectoryInputSchema should validate valid string', () => {
	const validInput = '/path/to/workshop'
	const result = workshopDirectoryInputSchema.safeParse(validInput)

	expect(result.success).toBe(true)
	if (result.success) {
		expect(result.data).toBe(validInput)
	}
})

test('workshopDirectoryInputSchema should reject non-string input', () => {
	const invalidInputs = [123, true, null, undefined, {}]

	invalidInputs.forEach((input) => {
		const result = workshopDirectoryInputSchema.safeParse(input)
		expect(result.success).toBe(false)
	})
})

test('workshopDirectoryInputSchema should accept empty string', () => {
	const emptyString = ''
	const result = workshopDirectoryInputSchema.safeParse(emptyString)

	expect(result.success).toBe(true)
	if (result.success) {
		expect(result.data).toBe(emptyString)
	}
})

test('workshopDirectoryInputSchema should accept string with spaces', () => {
	const inputWithSpaces = '  /path/with/spaces  '
	const result = workshopDirectoryInputSchema.safeParse(inputWithSpaces)

	expect(result.success).toBe(true)
	if (result.success) {
		expect(result.data).toBe(inputWithSpaces)
	}
})

test('workshopDirectoryInputSchema should accept absolute paths', () => {
	const absolutePaths = [
		'/Users/username/projects/workshop',
		'C:\\Users\\username\\projects\\workshop',
		'/home/user/workshop',
	]

	absolutePaths.forEach((path) => {
		const result = workshopDirectoryInputSchema.safeParse(path)
		expect(result.success).toBe(true)
		if (result.success) {
			expect(result.data).toBe(path)
		}
	})
})

test('workshopDirectoryInputSchema should accept relative paths', () => {
	const relativePaths = [
		'./workshop',
		'../workshop',
		'../../workshop',
		'workshop',
	]

	relativePaths.forEach((path) => {
		const result = workshopDirectoryInputSchema.safeParse(path)
		expect(result.success).toBe(true)
		if (result.success) {
			expect(result.data).toBe(path)
		}
	})
})

test('handleWorkshopDirectory rejects blank input (aha)', async () => {
	await expect(handleWorkshopDirectory('   ')).rejects.toThrow(
		'The workshop directory is required',
	)
})

test('handleWorkshopDirectory rejects relative paths', async () => {
	await expect(handleWorkshopDirectory('workshop')).rejects.toThrow(
		'The workshop directory must be an absolute path',
	)
})

test('handleWorkshopDirectory normalizes playground to workshop root', async () => {
	await using fixture = await createWorkshopFixture()
	vi.mocked(console.error).mockImplementation(() => {})

	const { init } = await import('@epic-web/workshop-utils/apps.server')
	const initMock = vi.mocked(init)
	initMock.mockClear()

	const resultPromise = handleWorkshopDirectory(fixture.playgroundDir)
	await expect(resultPromise).resolves.toBe(fixture.root)
	expect(initMock).toHaveBeenCalledWith(fixture.root)
})

test('handleWorkshopDirectory rejects when no workshop directory found (aha)', async () => {
	await using fixture = await createTempDir()
	vi.mocked(console.error).mockImplementation(() => {})

	await expect(handleWorkshopDirectory(fixture.root)).rejects.toThrow(
		/No workshop directory found/,
	)
})
