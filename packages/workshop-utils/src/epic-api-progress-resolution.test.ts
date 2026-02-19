import { expect, test } from 'vitest'
import { resolveLocalProgressForEpicLesson } from './epic-api.server.ts'

function createLocalData(overrides?: {
	workshopInstructionsEmbeds?: Array<string>
	workshopFinishedEmbeds?: Array<string>
	exercises?: Array<any>
}) {
	const workshopInstructions = {
		compiled: {
			status: 'success',
			epicVideoEmbeds: overrides?.workshopInstructionsEmbeds ?? [],
		},
	} as any
	const workshopFinished = {
		compiled: {
			status: 'success',
			epicVideoEmbeds: overrides?.workshopFinishedEmbeds ?? [],
		},
	} as any
	const exercises = (overrides?.exercises ?? []) as any

	return { workshopInstructions, workshopFinished, exercises }
}

test('resolves workshop instructions video location', () => {
	const local = createLocalData({
		workshopInstructionsEmbeds: ['https://www.epicweb.dev/workshops/ws/intro'],
	})

	expect(
		resolveLocalProgressForEpicLesson('intro', {
			workshopInstructions: local.workshopInstructions,
			workshopFinished: local.workshopFinished,
			exercises: local.exercises,
		}),
	).toEqual({ type: 'workshop-instructions' })
})

test('resolves exercise intro video location', () => {
	const local = createLocalData({
		exercises: [
			{
				exerciseNumber: 7,
				instructionsEpicVideoEmbeds: [
					'https://www.epicweb.dev/workshops/ws/lesson-07-intro',
				],
				finishedEpicVideoEmbeds: [],
				steps: [],
			},
		],
	})

	expect(
		resolveLocalProgressForEpicLesson('lesson-07-intro', {
			workshopInstructions: local.workshopInstructions,
			workshopFinished: local.workshopFinished,
			exercises: local.exercises,
		}),
	).toEqual({ type: 'instructions', exerciseNumber: 7 })
})

test('resolves step problem video location', () => {
	const local = createLocalData({
		exercises: [
			{
				exerciseNumber: 3,
				instructionsEpicVideoEmbeds: [],
				finishedEpicVideoEmbeds: [],
				steps: [
					{
						stepNumber: 2,
						problem: {
							epicVideoEmbeds: [
								'https://www.epicweb.dev/workshops/ws/step-3-2',
							],
						},
						solution: { epicVideoEmbeds: [] },
					},
				],
			},
		],
	})

	expect(
		resolveLocalProgressForEpicLesson('step-3-2', {
			workshopInstructions: local.workshopInstructions,
			workshopFinished: local.workshopFinished,
			exercises: local.exercises,
		}),
	).toEqual({
		type: 'step',
		exerciseNumber: 3,
		stepNumber: 2,
		stepType: 'problem',
	})
})

test('resolves step solution video location via /solution URL', () => {
	const local = createLocalData({
		exercises: [
			{
				exerciseNumber: 3,
				instructionsEpicVideoEmbeds: [],
				finishedEpicVideoEmbeds: [],
				steps: [
					{
						stepNumber: 2,
						problem: { epicVideoEmbeds: [] },
						solution: {
							epicVideoEmbeds: [
								'https://www.epicweb.dev/workshops/ws/step-3-2/solution',
							],
						},
					},
				],
			},
		],
	})

	expect(
		resolveLocalProgressForEpicLesson('step-3-2', {
			workshopInstructions: local.workshopInstructions,
			workshopFinished: local.workshopFinished,
			exercises: local.exercises,
		}),
	).toEqual({
		type: 'step',
		exerciseNumber: 3,
		stepNumber: 2,
		stepType: 'solution',
	})
})

test('tolerates trailing slashes and /embed suffixes when matching', () => {
	const local = createLocalData({
		exercises: [
			{
				exerciseNumber: 1,
				instructionsEpicVideoEmbeds: [],
				finishedEpicVideoEmbeds: [],
				steps: [
					{
						stepNumber: 1,
						problem: {
							epicVideoEmbeds: [
								'https://www.epicweb.dev/workshops/ws/with-trailing-slash/',
								'https://www.epicweb.dev/workshops/ws/with-embed/embed',
							],
						},
						solution: { epicVideoEmbeds: [] },
					},
				],
			},
		],
	})

	expect(
		resolveLocalProgressForEpicLesson('with-trailing-slash', {
			workshopInstructions: local.workshopInstructions,
			workshopFinished: local.workshopFinished,
			exercises: local.exercises,
		}),
	).toEqual({
		type: 'step',
		exerciseNumber: 1,
		stepNumber: 1,
		stepType: 'problem',
	})

	expect(
		resolveLocalProgressForEpicLesson('with-embed', {
			workshopInstructions: local.workshopInstructions,
			workshopFinished: local.workshopFinished,
			exercises: local.exercises,
		}),
	).toEqual({
		type: 'step',
		exerciseNumber: 1,
		stepNumber: 1,
		stepType: 'problem',
	})
})

test('strips EpicAI ~ suffix when matching (aha)', () => {
	const local = createLocalData({
		exercises: [
			{
				exerciseNumber: 2,
				instructionsEpicVideoEmbeds: [
					'https://www.epicai.pro/posts/some-lesson~abc123',
				],
				finishedEpicVideoEmbeds: [],
				steps: [],
			},
		],
	})

	expect(
		resolveLocalProgressForEpicLesson('some-lesson', {
			workshopInstructions: local.workshopInstructions,
			workshopFinished: local.workshopFinished,
			exercises: local.exercises,
		}),
	).toEqual({ type: 'instructions', exerciseNumber: 2 })
})
