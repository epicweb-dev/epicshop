import { invariantResponse } from '@epic-web/invariant'
import { requireAuthInfo } from '@epic-web/workshop-utils/db.server'
import {
	getProgress,
	updateProgress,
} from '@epic-web/workshop-utils/epic-api.server'
import { type ActionFunctionArgs } from 'react-router'
import { createConfettiHeaders } from '#app/utils/confetti.server.ts'
import { combineHeaders, ensureUndeployed } from '#app/utils/misc.tsx'
import { dataWithPE } from '#app/utils/pe.tsx'
import { createToastHeaders } from '#app/utils/toast.server.ts'

export async function action({ request }: ActionFunctionArgs) {
	ensureUndeployed()
	await requireAuthInfo({ request })
	const formData = await request.formData()
	const complete = formData.get('complete') === 'true'
	const lessonSlug = formData.get('lessonSlug')
	invariantResponse(
		typeof lessonSlug === 'string' && lessonSlug.length > 0,
		'lessonSlug must be a string',
		{ status: 400 },
	)
	const beforeProgress = await getProgress({ request }).catch((e) => {
		console.error('Failed to get progress', e)
		return []
	})
	const result = await updateProgress({ lessonSlug, complete }, { request })

	const lessonProgress = beforeProgress.find(
		(p) => p.epicLessonSlug === lessonSlug,
	)
	function getCompletionAnnouncement() {
		if (!complete) return null
		if (!lessonProgress) return null
		const allOtherAreFinished = beforeProgress.every(
			(p) =>
				p.epicCompletedAt || p.epicLessonSlug === lessonProgress.epicLessonSlug,
		)
		if (allOtherAreFinished) return 'You completed the workshop!'

		if (
			lessonProgress.type === 'workshop-instructions' ||
			lessonProgress.type === 'unknown' ||
			lessonProgress.type === 'workshop-finished'
		) {
			return null
		}
		const { exerciseNumber } = lessonProgress
		const otherExerciseLessons = beforeProgress.filter(
			(p) =>
				(p.type === 'step' ||
					p.type === 'instructions' ||
					p.type === 'finished') &&
				p.exerciseNumber === exerciseNumber &&
				p.epicLessonSlug !== lessonSlug,
		)
		const otherAreFinished = otherExerciseLessons.every(
			(p) => p.epicCompletedAt,
		)
		return otherAreFinished ? `You completed exercise ${exerciseNumber}!` : null
	}
	const announcement = getCompletionAnnouncement()

	return dataWithPE(request, formData, result, {
		headers: combineHeaders(
			announcement ? createConfettiHeaders() : null,
			announcement
				? await createToastHeaders({
						title: 'Congratulations!',
						description: announcement,
						type: 'success',
					})
				: null,
		),
	})
}
