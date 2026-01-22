type ProgressEntry = {
	type: string
	exerciseNumber?: number | null
	stepNumber?: number | null
	epicCompletedAt?: unknown
}

type CompletedStep = {
	exerciseNumber: number
	stepNumber: number
}

type PracticePastLessonInput = {
	progress: Array<ProgressEntry> | null | undefined
	currentPath: string
}

export type PracticePastLessonData = {
	route: string | null
	key: string | null
}

function getCompletedSteps(
	progress: Array<ProgressEntry>,
): Array<CompletedStep> {
	const completedSteps: Array<CompletedStep> = []
	for (const entry of progress) {
		if (entry.type !== 'step' || !entry.epicCompletedAt) continue
		if (
			typeof entry.exerciseNumber !== 'number' ||
			typeof entry.stepNumber !== 'number'
		) {
			continue
		}
		completedSteps.push({
			exerciseNumber: entry.exerciseNumber,
			stepNumber: entry.stepNumber,
		})
	}
	return completedSteps
}

function getStepRoutes(step: CompletedStep) {
	const exercise = step.exerciseNumber.toString().padStart(2, '0')
	const stepNumber = step.stepNumber.toString().padStart(2, '0')
	const baseRoute = `/exercise/${exercise}/${stepNumber}`
	return {
		id: `${exercise}/${stepNumber}`,
		problemRoute: `${baseRoute}/problem`,
		solutionRoute: `${baseRoute}/solution`,
	}
}

function getAvailableSteps(
	completedSteps: Array<CompletedStep>,
	currentPath: string,
) {
	return completedSteps.filter((step) => {
		const { problemRoute, solutionRoute } = getStepRoutes(step)
		return currentPath !== problemRoute && currentPath !== solutionRoute
	})
}

export function getPracticePastLessonKey({
	progress,
	currentPath,
}: PracticePastLessonInput) {
	if (!progress) return null

	const completedSteps = getCompletedSteps(progress)
	if (completedSteps.length < 2) return null

	const availableSteps = getAvailableSteps(completedSteps, currentPath)
	if (availableSteps.length === 0) return null

	const availableStepIds = availableSteps
		.map((step) => getStepRoutes(step).id)
		.sort()
		.join(',')
	return `${currentPath}::${availableStepIds}`
}

export function getPracticePastLessonRoute(
	{ progress, currentPath }: PracticePastLessonInput,
	random: () => number = Math.random,
) {
	if (!progress) return null

	const completedSteps = getCompletedSteps(progress)
	if (completedSteps.length < 2) return null

	const availableSteps = getAvailableSteps(completedSteps, currentPath)
	if (availableSteps.length === 0) return null

	const randomStep =
		availableSteps[Math.floor(random() * availableSteps.length)]
	if (!randomStep) return null

	return getStepRoutes(randomStep).problemRoute
}

export function getPracticePastLessonData(
	input: PracticePastLessonInput,
	random: () => number = Math.random,
): PracticePastLessonData {
	const key = getPracticePastLessonKey(input)
	if (!key) {
		return { key: null, route: null }
	}
	return {
		key,
		route: getPracticePastLessonRoute(input, random),
	}
}
