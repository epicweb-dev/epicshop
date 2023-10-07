import { json, type DataFunctionArgs } from '@remix-run/node'
import { useFetcher, useRouteLoaderData } from '@remix-run/react'
import { Button } from '#app/components/button.tsx'
import { type loader as rootLoader } from '#app/root.tsx'
import { requireAuthInfo } from '#app/utils/db.server.ts'
import { updateProgress, type Progress } from '#app/utils/epic-api.ts'
import { ensureUndeployed, invariantResponse } from '#app/utils/misc.tsx'

export function useEpicProgress() {
	const data = useRouteLoaderData<typeof rootLoader>('root')
	return data?.progress
}

export function useNextExerciseRoute() {
	const progress = useEpicProgress()
	if (!progress) return null
	const scoreProgress = (a: (typeof progress)[number]) => {
		if (a.type === 'workshop-instructions') return 0
		if (a.type === 'workshop-finished') return 10000
		if (a.type === 'instructions') return a.exerciseNumber * 100
		if (a.type === 'step') return a.exerciseNumber * 100 + a.stepNumber
		if (a.type === 'finished') return a.exerciseNumber * 100 + 100
		if (a.type === 'unknown') return 100000
		return -1
	}
	const sortedProgress = progress.sort((a, b) => {
		return scoreProgress(a) - scoreProgress(b)
	})
	const nextProgress = sortedProgress.find(p => !p.epicCompletedAt)
	if (!nextProgress) return null

	if (nextProgress.type === 'unknown') return null
	if (nextProgress.type === 'workshop-instructions') return '/'
	if (nextProgress.type === 'workshop-finished') return '/finished'

	const ex = nextProgress.exerciseNumber.toString().padStart(2, '0')
	if (nextProgress.type === 'instructions') return `/${ex}`
	if (nextProgress.type === 'finished') return `/${ex}/finished`

	const st = nextProgress.stepNumber.toString().padStart(2, '0')
	if (nextProgress.type === 'step') return `/${ex}/${st}/problem`
}

export async function action({ request }: DataFunctionArgs) {
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
	const result = await updateProgress({ lessonSlug, complete }, { request })
	return json(result)
}

type WorkshopProgressType = Extract<
	Progress['type'],
	'workshop-instructions' | 'workshop-finished'
>
type ExerciseProgressType = Extract<
	Progress['type'],
	'instructions' | 'finished'
>
type StepProgressType = Extract<Progress['type'], 'step'>

export function ProgressToggle({
	type,
	exerciseNumber,
	stepNumber,
}:
	| { exerciseNumber: number; stepNumber?: never; type: ExerciseProgressType }
	| { exerciseNumber: number; stepNumber: number; type: StepProgressType }
	| {
			type: WorkshopProgressType
			exerciseNumber?: never
			stepNumber?: never
	  }) {
	const progressFetcher = useFetcher<typeof action>()
	const progress = useEpicProgress()

	let progressItem: Exclude<typeof progress, undefined>[number] | null = null

	if (type === 'workshop-finished' || type === 'workshop-instructions') {
		progressItem = progress?.find(p => p.type === type) ?? null
	} else if (type === 'instructions' || type === 'finished') {
		progressItem =
			progress?.find(
				p => p.type === type && p.exerciseNumber === exerciseNumber,
			) ?? null
	} else if (type === 'step') {
		progressItem =
			progress?.find(
				p =>
					p.type === type &&
					p.exerciseNumber === exerciseNumber &&
					p.stepNumber === stepNumber,
			) ?? null
	}

	const optimisticCompleted = progressFetcher.formData?.has('complete')
		? progressFetcher.formData?.get('complete') === 'true'
		: Boolean(progressItem?.epicCompletedAt)

	return (
		<progressFetcher.Form method="POST" action="/progress">
			<input
				type="hidden"
				name="lessonSlug"
				value={progressItem?.epicLessonSlug}
			/>
			<input
				type="hidden"
				name="complete"
				value={(!optimisticCompleted).toString()}
			/>
			<Button varient="primary" type="submit">
				{optimisticCompleted ? 'Mark as incomplete' : 'Mark as complete'}
			</Button>
		</progressFetcher.Form>
	)
}
