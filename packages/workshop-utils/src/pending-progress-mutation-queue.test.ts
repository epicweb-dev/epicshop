import { expect, test } from 'vitest'
import {
	reconcileQueuedProgressMutation,
	type PendingProgressMutation,
	type PendingProgressMutationScope,
} from './db.server.ts'

const scope: PendingProgressMutationScope = {
	host: 'www.epicweb.dev',
	workshopSlug: 'example-workshop',
	userId: 'user_123',
}

function scopedMutation({
	lessonSlug,
	complete,
	queuedAt,
}: {
	lessonSlug: string
	complete: boolean
	queuedAt: string
}): PendingProgressMutation {
	return { ...scope, lessonSlug, complete, queuedAt }
}

test('queues a new scoped progress mutation when none exists', () => {
	const result = reconcileQueuedProgressMutation({
		pendingProgressMutations: [],
		scope,
		lessonSlug: '01-01-problem',
		complete: true,
		queuedAt: '2026-03-05T10:00:00.000Z',
	})

	expect(result).toEqual([
		scopedMutation({
			lessonSlug: '01-01-problem',
			complete: true,
			queuedAt: '2026-03-05T10:00:00.000Z',
		}),
	])
})

test('removes queued mutation when new mutation undoes it', () => {
	const result = reconcileQueuedProgressMutation({
		pendingProgressMutations: [
			scopedMutation({
				lessonSlug: '01-01-problem',
				complete: true,
				queuedAt: '2026-03-05T10:00:00.000Z',
			}),
		],
		scope,
		lessonSlug: '01-01-problem',
		complete: false,
		queuedAt: '2026-03-05T10:01:00.000Z',
	})

	expect(result).toEqual([])
})

test('preserves out-of-scope queued mutations while cancelling scoped no-op', () => {
	const otherScopeMutation: PendingProgressMutation = {
		host: 'www.epicreact.dev',
		workshopSlug: 'another-workshop',
		userId: 'user_999',
		lessonSlug: '01-01-problem',
		complete: false,
		queuedAt: '2026-03-05T10:00:00.000Z',
	}
	const result = reconcileQueuedProgressMutation({
		pendingProgressMutations: [
			scopedMutation({
				lessonSlug: '01-01-problem',
				complete: true,
				queuedAt: '2026-03-05T10:00:00.000Z',
			}),
			otherScopeMutation,
		],
		scope,
		lessonSlug: '01-01-problem',
		complete: false,
		queuedAt: '2026-03-05T10:01:00.000Z',
	})

	expect(result).toEqual([otherScopeMutation])
})
