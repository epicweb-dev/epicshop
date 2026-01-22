import { invariantResponse } from '@epic-web/invariant'
import { requireAuthInfo } from '@epic-web/workshop-utils/db.server'
import {
	getProgress,
	updateProgress,
	type Progress,
} from '@epic-web/workshop-utils/epic-api.server'
import clsx from 'clsx'
import { motion } from 'framer-motion'
import * as React from 'react'
import {
	useFetcher,
	useFetchers,
	useLocation,
	useNavigation,
	type ActionFunctionArgs,
} from 'react-router'
import { createConfettiHeaders } from '#app/utils/confetti.server.ts'
import { combineHeaders, ensureUndeployed } from '#app/utils/misc.tsx'
import { dataWithPE, usePERedirectInput } from '#app/utils/pe.tsx'
import {
	getPracticePastLessonKey,
	getPracticePastLessonRoute,
} from '#app/utils/practice-past-lesson.ts'
import { useRootLoaderData } from '#app/utils/root-loader.ts'
import { createToastHeaders } from '#app/utils/toast.server.ts'

export function useEpicProgress() {
	const data = useRootLoaderData()
	const progressFetcher = useFetchers().find(
		(f) => f.formAction === '/progress' && f.formData?.has('complete'),
	)
	if (!progressFetcher || !data.progress) return data.progress ?? null
	return data.progress.map((p) => {
		const optimisticCompleted =
			progressFetcher.formData?.get('complete') === 'true'
		const optimisticLessonSlug = progressFetcher.formData?.get('lessonSlug')
		if (optimisticLessonSlug === p.epicLessonSlug) {
			return {
				...p,
				epicCompletedAt: optimisticCompleted ? Date.now() : null,
			}
		} else {
			return p
		}
	})
}
export type SerializedProgress = ReturnType<
	typeof useRequireEpicProgress
>[number]
export function useRequireEpicProgress() {
	const progress = useEpicProgress()
	if (!progress) return []
	return progress
}

export function useNextExerciseRoute() {
	const currentPathname = useLocation().pathname
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
	const nextProgress = sortedProgress.find((p) => !p.epicCompletedAt)
	if (!nextProgress) return null

	if (nextProgress.type === 'unknown') return null
	if (nextProgress.type === 'workshop-instructions') return '/'
	if (nextProgress.type === 'workshop-finished') return '/finished'

	const ex = nextProgress.exerciseNumber.toString().padStart(2, '0')
	if (nextProgress.type === 'instructions') return `/exercise/${ex}`
	if (nextProgress.type === 'finished') return `/exercise/${ex}/finished`

	const st = nextProgress.stepNumber.toString().padStart(2, '0')

	if (nextProgress.type === 'step') {
		const problemRoute = `/exercise/${ex}/${st}/problem`
		const solutionRoute = `/exercise/${ex}/${st}/solution`
		if (currentPathname === problemRoute || currentPathname === solutionRoute) {
			return solutionRoute
		}
		return problemRoute
	}

	return null
}

export function useRandomCompletedExerciseRoute() {
	const location = useLocation()
	const progress = useEpicProgress()
	const { practicePastLesson } = useRootLoaderData()
	const [randomRoute, setRandomRoute] = React.useState<string | null>(
		practicePastLesson?.route ?? null,
	)
	const lastKeyRef = React.useRef(practicePastLesson?.key ?? null)

	React.useEffect(() => {
		const nextKey = getPracticePastLessonKey({
			progress,
			currentPath: location.pathname,
		})
		if (nextKey === lastKeyRef.current) return

		lastKeyRef.current = nextKey
		setRandomRoute(
			nextKey
				? getPracticePastLessonRoute({
						progress,
						currentPath: location.pathname,
					})
				: null,
		)
	}, [progress, location.pathname])

	return randomRoute
}

const percentageClassNames = {
	0: '',
	1: 'before:h-[10%]',
	2: 'before:h-[20%]',
	3: 'before:h-[30%]',
	4: 'before:h-[40%]',
	5: 'before:h-[50%]',
	6: 'before:h-[60%]',
	7: 'before:h-[70%]',
	8: 'before:h-[80%]',
	9: 'before:h-[90%]',
	10: 'before:h-[100%]',
}

export function useExerciseProgressClassName(exerciseNumber: number) {
	const progress = useEpicProgress()
	if (!progress?.length) return null
	const exerciseProgress = progress.filter(
		(p) =>
			(p.type === 'instructions' ||
				p.type === 'step' ||
				p.type === 'finished') &&
			p.exerciseNumber === exerciseNumber,
	)
	if (!exerciseProgress.length) return null

	const percentComlete =
		exerciseProgress.reduce(
			(acc, p) => (p.epicCompletedAt ? acc + 1 : acc),
			0,
		) / exerciseProgress.length

	const numerator = Math[percentComlete > 0.1 ? 'floor' : 'ceil'](
		percentComlete * 10,
	) as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10

	return `relative ${percentageClassNames[numerator]} before:bg-highlight before:absolute before:left-0 before:top-0 before:w-[4px]`
}

export function useProgressItemClassName(
	progressItemSearch: ProgressItemSearch,
) {
	const progressItem = useProgressItem(progressItemSearch)
	if (!progressItem?.epicCompletedAt) return null
	return `relative before:h-[100%] before:bg-highlight before:absolute before:left-0 before:top-0 before:w-[4px]`
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

export type ProgressItemSearch =
	| {
			exerciseNumber: number
			stepNumber?: never
			type: ExerciseProgressType
	  }
	| {
			exerciseNumber: number
			stepNumber: number
			type: StepProgressType
	  }
	| {
			type: WorkshopProgressType
			exerciseNumber?: never
			stepNumber?: never
	  }

export function useProgressItem({
	exerciseNumber,
	stepNumber,
	type,
}: ProgressItemSearch) {
	const progress = useEpicProgress()
	if (!progress?.length) return null

	if (type === 'workshop-finished' || type === 'workshop-instructions') {
		return progress.find((p) => p.type === type) ?? null
	} else if (type === 'instructions' || type === 'finished') {
		return (
			progress.find(
				(p) => p.type === type && p.exerciseNumber === exerciseNumber,
			) ?? null
		)
	} else if (type === 'step') {
		return (
			progress.find(
				(p) =>
					p.type === type &&
					p.exerciseNumber === exerciseNumber &&
					p.stepNumber === stepNumber,
			) ?? null
		)
	}
	return null
}

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

export function ProgressToggle({
	className,
	...progressItemSearch
}: { className?: string } & ProgressItemSearch) {
	const progressFetcher = useFetcher<typeof action>()
	const peRedirectInput = usePERedirectInput()
	const progressItem = useProgressItem(progressItemSearch)
	const animationRef = React.useRef<HTMLDivElement>(null)
	const buttonRef = React.useRef<HTMLButtonElement>(null)

	const optimisticCompleted = progressFetcher.formData?.has('complete')
		? progressFetcher.formData.get('complete') === 'true'
		: Boolean(progressItem?.epicCompletedAt)

	const [startAnimation, setStartAnimation] = React.useState(false)

	const location = useLocation()
	const navigation = useNavigation()

	const navigationLocationStateFrom = navigation.location?.state?.from
	const navigationLocationPathname = navigation.location?.pathname

	const locationPathname = location.pathname
	React.useEffect(() => {
		if (navigationLocationStateFrom === 'continue next lesson button') {
			if (locationPathname === navigationLocationPathname) {
				setStartAnimation(true)
				buttonRef.current?.focus()
			}
		}
	}, [
		location.key,
		locationPathname,
		navigationLocationPathname,
		navigationLocationStateFrom,
	])

	React.useEffect(() => {
		let latest = true
		if (!startAnimation) return

		// wait a bit for the animation to start
		void new Promise((resolve) => setTimeout(resolve, 200)).then(async () => {
			if (!latest) return
			if (!animationRef.current) return

			const animationPromises = animationRef.current
				.getAnimations()
				.map(({ finished }) => finished)

			return Promise.allSettled(animationPromises).then(() => {
				if (!latest) return
				setStartAnimation(false)
			})
		})
		return () => {
			latest = false
		}
	}, [startAnimation])

	if (ENV.EPICSHOP_DEPLOYED || !progressItem) return null

	return (
		<progressFetcher.Form method="POST" action="/progress">
			{peRedirectInput}
			<input
				type="hidden"
				name="lessonSlug"
				value={progressItem.epicLessonSlug}
			/>
			<input
				type="hidden"
				name="complete"
				value={(!optimisticCompleted).toString()}
			/>

			<motion.button
				ref={buttonRef}
				onClick={() => {
					setStartAnimation(!optimisticCompleted)
				}}
				type="submit"
				className={clsx(
					'group relative flex w-full items-center justify-between overflow-hidden transition hover:bg-[hsl(var(--foreground)/0.02)] focus:bg-[hsl(var(--foreground)/0.02)]',
					className,
				)}
			>
				{optimisticCompleted ? 'Mark as incomplete' : 'Mark as complete'}
				{startAnimation ? (
					<motion.div
						ref={animationRef}
						className="bg-foreground/20 absolute right-0 h-20 w-20 rounded-full"
						initial={{
							scale: 0.5,
							opacity: 0,
						}}
						animate={{
							scale: [0.5, 2],
							opacity: [0, 1, 0],
						}}
						transition={{
							duration: 1,
							ease: 'easeInOut',
						}}
					/>
				) : null}
				<motion.div
					aria-hidden
					className={clsx(
						'relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border transition',
						{
							'bg-foreground text-background duration-1000':
								optimisticCompleted,
							'group-hover:bg-background duration-100': !optimisticCompleted,
						},
					)}
				>
					{optimisticCompleted ? (
						'✓'
					) : (
						<div className="absolute -translate-y-10 opacity-25 transition group-hover:translate-y-0">
							✓
						</div>
					)}
				</motion.div>
			</motion.button>
		</progressFetcher.Form>
	)
}
