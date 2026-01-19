import { type Route } from '../+types/_layout.tsx'

export type StepTitleBits = {
	emoji: string
	stepNumber: string
	title: string
	exerciseNumber: string
	exerciseTitle: string
	workshopTitle?: string
	type: 'problem' | 'solution'
}

export function getStepTitleBits(
	data: Awaited<Route.ComponentProps['loaderData']> | undefined,
	workshopTitle?: string,
): StepTitleBits {
	const exerciseNumber =
		data?.exerciseStepApp.exerciseNumber.toString().padStart(2, '0') ?? '00'
	const stepNumber =
		data?.exerciseStepApp.stepNumber.toString().padStart(2, '0') ?? '00'
	const emoji = (
		{
			problem: '💪',
			solution: '🏁',
		} as const
	)[data?.type ?? 'problem']
	const title = data?.[data.type]?.title ?? 'N/A'
	return {
		emoji,
		stepNumber,
		title,
		exerciseNumber,
		exerciseTitle: data?.exerciseTitle ?? 'Unknown exercise',
		workshopTitle,
		type: data?.type ?? 'problem',
	}
}
