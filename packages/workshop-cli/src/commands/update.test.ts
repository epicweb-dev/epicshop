import { test, expect, vi } from 'vitest'
import { update } from './update.ts'

// Mock the dynamic import of updateLocalRepo
vi.mock('@epic-web/workshop-utils/git.server', () => ({
	updateLocalRepo: vi.fn(),
}))

function setEnv(key: string, value: string | undefined) {
	const original = process.env[key]
	if (value === undefined) {
		delete process.env[key]
	} else {
		process.env[key] = value
	}

	return {
		[Symbol.dispose]() {
			if (original === undefined) {
				delete process.env[key]
			} else {
				process.env[key] = original
			}
		},
	}
}

async function getUpdateLocalRepoMock() {
	const { updateLocalRepo } =
		await import('@epic-web/workshop-utils/git.server')
	const updateLocalRepoMock = vi.mocked(updateLocalRepo)
	updateLocalRepoMock.mockReset()
	return updateLocalRepoMock
}

test('update should return failure result when deployed environment', async () => {
	using ignoredEnv = setEnv('EPICSHOP_DEPLOYED', 'true')

	const resultPromise = update({ silent: true })

	await expect(resultPromise).resolves.toMatchObject({
		success: false,
		message: 'Updates are not available in deployed environments.',
	})

	const result = await resultPromise
	expect(result.error).toBeUndefined()
})

test('update should return failure result when deployed environment with 1', async () => {
	using ignoredEnv = setEnv('EPICSHOP_DEPLOYED', '1')

	const resultPromise = update({ silent: true })

	await expect(resultPromise).resolves.toMatchObject({
		success: false,
		message: 'Updates are not available in deployed environments.',
	})

	const result = await resultPromise
	expect(result.error).toBeUndefined()
})

test('update should return success result when no updates are available', async () => {
	using ignoredEnv = setEnv('EPICSHOP_DEPLOYED', undefined)

	const updateLocalRepoMock = await getUpdateLocalRepoMock()
	updateLocalRepoMock.mockResolvedValue({
		status: 'success',
		message: 'No updates available.',
	})

	const resultPromise = update({ silent: true })

	await expect(resultPromise).resolves.toMatchObject({
		success: true,
		message: 'No updates available.',
	})

	const result = await resultPromise
	expect(result.error).toBeUndefined()
})

test('update should return success result when updates are applied successfully', async () => {
	using ignoredEnv = setEnv('EPICSHOP_DEPLOYED', undefined)

	const updateLocalRepoMock = await getUpdateLocalRepoMock()
	updateLocalRepoMock.mockResolvedValue({
		status: 'success',
		message: 'Updated successfully.',
	})

	const resultPromise = update({ silent: true })

	await expect(resultPromise).resolves.toMatchObject({
		success: true,
		message: 'Updated successfully.',
	})

	const result = await resultPromise
	expect(result.error).toBeUndefined()
})

test('update should return failure result when updateLocalRepo fails', async () => {
	using ignoredEnv = setEnv('EPICSHOP_DEPLOYED', undefined)

	const updateLocalRepoMock = await getUpdateLocalRepoMock()
	updateLocalRepoMock.mockResolvedValue({
		status: 'error',
		message: 'Git pull failed: network error',
	})

	const resultPromise = update({ silent: true })

	await expect(resultPromise).resolves.toMatchObject({
		success: false,
		message: 'Git pull failed: network error',
	})

	const result = await resultPromise
	expect(result.error).toBeUndefined()
})

test('update should return failure result when updateLocalRepo throws an error', async () => {
	using ignoredEnv = setEnv('EPICSHOP_DEPLOYED', undefined)

	const updateLocalRepoMock = await getUpdateLocalRepoMock()
	updateLocalRepoMock.mockRejectedValue(new Error('Module not found'))

	const resultPromise = update({ silent: true })

	await expect(resultPromise).resolves.toMatchObject({
		success: false,
		message: 'Update functionality not available',
	})

	const result = await resultPromise
	expect(result.error).toBeInstanceOf(Error)
	expect(result.error?.message).toBe('Module not found')
})

test('update should log success message when silent is false', async () => {
	using ignoredEnv = setEnv('EPICSHOP_DEPLOYED', undefined)
	const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

	try {
		const updateLocalRepoMock = await getUpdateLocalRepoMock()
		updateLocalRepoMock.mockResolvedValue({
			status: 'success',
			message: 'Updated successfully.',
		})

		const resultPromise = update({ silent: false })

		await expect(resultPromise).resolves.toMatchObject({
			success: true,
			message: 'Updated successfully.',
		})

		expect(logSpy).toHaveBeenCalledWith('✅ Updated successfully.')
	} finally {
		logSpy.mockRestore()
	}
})

test('update should log error message when silent is false and updateLocalRepo fails', async () => {
	using ignoredEnv = setEnv('EPICSHOP_DEPLOYED', undefined)
	vi.mocked(console.error).mockImplementation(() => {})

	const updateLocalRepoMock = await getUpdateLocalRepoMock()
	updateLocalRepoMock.mockResolvedValue({
		status: 'error',
		message: 'Git pull failed: network error',
	})

	const resultPromise = update({ silent: false })

	await expect(resultPromise).resolves.toMatchObject({
		success: false,
		message: 'Git pull failed: network error',
	})

	expect(console.error).toHaveBeenCalledWith(
		'❌ Git pull failed: network error',
	)
})
