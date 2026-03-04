import { expect, test } from 'vitest'
import {
	resolveProgressMutationOutcome,
	resolveProgressSyncState,
	shouldQueueProgressMutationForStatus,
} from './epic-api.server.ts'

test('queues retryable and auth progress update failures', () => {
	for (const status of [401, 403, 408, 425, 429, 500, 503]) {
		expect(shouldQueueProgressMutationForStatus(status)).toBe(true)
	}
})

test('does not queue permanent client-side failures', () => {
	for (const status of [400, 404, 422]) {
		expect(shouldQueueProgressMutationForStatus(status)).toBe(false)
	}
})

test('keeps remote completion state when there is no pending mutation', () => {
	expect(
		resolveProgressSyncState({
			epicCompletedAt: '2026-03-04T10:00:00.000Z',
		}),
	).toEqual({
		epicCompletedAt: '2026-03-04T10:00:00.000Z',
		syncStatus: 'synced',
	})
})

test('overrides completion with pending local completion state', () => {
	expect(
		resolveProgressSyncState({
			epicCompletedAt: null,
			pendingProgressMutation: {
				lessonSlug: '01-01-problem',
				complete: true,
				queuedAt: '2026-03-04T10:05:00.000Z',
			},
		}),
	).toEqual({
		epicCompletedAt: '2026-03-04T10:05:00.000Z',
		syncStatus: 'pending',
	})
})

test('overrides completion with pending local incompletion state', () => {
	expect(
		resolveProgressSyncState({
			epicCompletedAt: '2026-03-04T10:00:00.000Z',
			pendingProgressMutation: {
				lessonSlug: '01-01-problem',
				complete: false,
				queuedAt: '2026-03-04T10:05:00.000Z',
			},
		}),
	).toEqual({
		epicCompletedAt: null,
		syncStatus: 'pending',
	})
})

test('returns queued when lesson mutation remains pending', () => {
	expect(
		resolveProgressMutationOutcome({
			lessonSlug: '01-01-problem',
			syncResult: {
				pendingProgressMutations: [
					{
						lessonSlug: '01-01-problem',
						complete: true,
						queuedAt: '2026-03-04T10:05:00.000Z',
					},
				],
				droppedProgressMutations: [],
			},
		}),
	).toEqual({
		status: 'queued',
		queuedCount: 1,
	})
})

test('returns error when lesson mutation is dropped as permanent failure', () => {
	expect(
		resolveProgressMutationOutcome({
			lessonSlug: '01-01-problem',
			syncResult: {
				pendingProgressMutations: [],
				droppedProgressMutations: [
					{
						lessonSlug: '01-01-problem',
						complete: true,
						reason: '400 Bad Request',
					},
				],
			},
		}),
	).toEqual({
		status: 'error',
		error: '400 Bad Request',
	})
})

test('returns success when lesson mutation is no longer queued or dropped', () => {
	expect(
		resolveProgressMutationOutcome({
			lessonSlug: '01-01-problem',
			syncResult: {
				pendingProgressMutations: [],
				droppedProgressMutations: [],
			},
		}),
	).toEqual({ status: 'success' })
})
