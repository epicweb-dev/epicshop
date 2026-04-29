import { expect, test, vi } from 'vitest'
import { quizMe } from './prompts.ts'
import { exerciseContextResource } from './resources.ts'

vi.mock('@epic-web/workshop-utils/apps.server', () => ({
	getExercises: vi.fn(async () => [{ exerciseNumber: 3 }]),
}))

vi.mock('@epic-web/workshop-utils/config.server', () => ({
	getWorkshopConfig: vi.fn(() => ({
		title: 'Test Workshop',
		subtitle: 'Testing Sub',
	})),
}))

vi.mock('./resources.ts', () => ({
	exerciseContextResource: {
		getResource: vi.fn(
			async ({ exerciseNumber }: { exerciseNumber: number }) => ({
				uri: `epicshop://exercise/${exerciseNumber}`,
				mimeType: 'text/plain',
				text: `exercise ${exerciseNumber}`,
			}),
		),
	},
}))

vi.mock('./utils.ts', async () => {
	const actual =
		await vi.importActual<typeof import('./utils.ts')>('./utils.ts')
	return {
		...actual,
		handleWorkshopDirectory: vi.fn(async (workshopDirectory: string) => {
			return workshopDirectory
		}),
	}
})

test('quizMe chooses a random exercise when none provided (aha)', async () => {
	const resultPromise = quizMe({ workshopDirectory: '/workshop' })

	await expect(resultPromise).resolves.toMatchObject({
		messages: [
			{ role: 'user', content: { type: 'text' } },
			{ role: 'user', content: { type: 'resource' } },
		],
	})

	const result = await resultPromise
	const getResource = vi.mocked(exerciseContextResource.getResource)

	expect(getResource).toHaveBeenCalledWith({
		workshopDirectory: '/workshop',
		exerciseNumber: 3,
	})
	const firstMessage = result.messages[0]
	expect(firstMessage?.content.type).toBe('text')
	if (!firstMessage || firstMessage.content.type !== 'text') {
		throw new Error('Expected first message to be text')
	}
	expect(firstMessage.content.text).toContain('exercise 3')
})

test('quizMe rejects non-numeric exercise numbers (aha)', async () => {
	const resultPromise = quizMe({
		workshopDirectory: '/workshop',
		exerciseNumber: 'not-a-number',
	})

	await expect(resultPromise).rejects.toThrow(
		'Exercise number must be a number',
	)
})
