import { getExercises } from '@epic-web/workshop-utils/apps.server'
import { getEpicVideoInfos } from '@epic-web/workshop-utils/epic-api.server'
import { type Timings } from '@epic-web/workshop-utils/timing.server'

function getFirstEpicVideoUrlForExercise(exercise: {
	exerciseNumber: number
	instructionsEpicVideoEmbeds?: Array<string> | undefined
	finishedEpicVideoEmbeds?: Array<string> | undefined
	steps: Array<
		| {
				stepNumber: number
				problem?: { epicVideoEmbeds?: Array<string> | undefined } | undefined
				solution?: { epicVideoEmbeds?: Array<string> | undefined } | undefined
		  }
		| undefined
	>
}) {
	const direct =
		exercise.instructionsEpicVideoEmbeds?.[0] ??
		exercise.steps
			.filter(Boolean)
			.sort((a, b) => a.stepNumber - b.stepNumber)
			.flatMap((step) => [
				step.problem?.epicVideoEmbeds?.[0],
				step.solution?.epicVideoEmbeds?.[0],
			])
			.find(Boolean) ??
		exercise.finishedEpicVideoEmbeds?.[0]

	return direct ?? null
}

export async function getLessonFirstEpicVideoAccess({
	request,
	timings,
}: {
	request: Request
	timings?: Timings
}) {
	const exercises = await getExercises({ request, timings })

	const firstVideoUrlByExerciseNumber: Record<number, string> = {}
	for (const exercise of exercises) {
		const firstUrl = getFirstEpicVideoUrlForExercise(exercise)
		if (firstUrl) firstVideoUrlByExerciseNumber[exercise.exerciseNumber] = firstUrl
	}

	const uniqueUrls = Array.from(
		new Set(Object.values(firstVideoUrlByExerciseNumber)),
	)
	const videoInfos = await getEpicVideoInfos(uniqueUrls, { request, timings })

	const lessonFirstEpicVideoAccess: Record<number, boolean> = {}
	for (const [exerciseNumberString, url] of Object.entries(
		firstVideoUrlByExerciseNumber,
	)) {
		const exerciseNumber = Number(exerciseNumberString)
		const info = videoInfos[url]
		lessonFirstEpicVideoAccess[exerciseNumber] = info?.status === 'success'
	}

	return { lessonFirstEpicVideoAccess, firstVideoUrlByExerciseNumber } as const
}

export async function getUserHasAccessToLessonFirstEpicVideo({
	request,
	timings,
	exerciseNumber,
}: {
	request: Request
	timings?: Timings
	exerciseNumber: number
}) {
	const exercises = await getExercises({ request, timings })
	const exercise = exercises.find((e) => e.exerciseNumber === exerciseNumber)
	if (!exercise) return false

	const url = getFirstEpicVideoUrlForExercise(exercise)
	if (!url) return false

	const videoInfos = await getEpicVideoInfos([url], { request, timings })
	return videoInfos[url]?.status === 'success'
}

