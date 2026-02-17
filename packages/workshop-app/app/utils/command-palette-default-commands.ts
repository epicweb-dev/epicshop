import { getExercisePath, getExerciseStepPath } from '#app/utils/misc.tsx'
import {
	type CommandPaletteCommand,
	type CommandPaletteController,
	type CommandPaletteSelectOption,
} from './command-palette'

function isBrowser() {
	return typeof window !== 'undefined' && typeof document !== 'undefined'
}

function hasKeyboardAction(action: string) {
	if (!isBrowser()) return false
	return Boolean(document.querySelector(`[data-keyboard-action="${action}"]`))
}

function formatExerciseNumber(n: number) {
	return n.toString().padStart(2, '0')
}

function createGoToOptions(
	ctx: Parameters<CommandPaletteCommand['run']>[0],
): Array<CommandPaletteSelectOption<string>> {
	const options: Array<CommandPaletteSelectOption<string>> = [
		{
			id: 'home',
			title: 'Home',
			subtitle: '/',
			group: 'Pages',
			keywords: ['home', 'start'],
			value: '/',
		},
		{
			id: 'account',
			title: 'Account',
			subtitle: '/account',
			group: 'Pages',
			keywords: ['account', 'profile', 'user'],
			value: '/account',
		},
		{
			id: 'admin',
			title: 'Admin',
			subtitle: '/admin',
			group: 'Pages',
			keywords: ['admin', 'processes', 'sidecar', 'status'],
			value: '/admin',
		},
		{
			id: 'workshop-feedback',
			title: 'Workshop feedback',
			subtitle: '/finished',
			group: 'Pages',
			keywords: ['feedback', 'workshop', 'finished'],
			value: '/finished',
		},
		{
			id: 'extras',
			title: 'Extras',
			subtitle: '/extra',
			group: 'Pages',
			keywords: ['extra', 'extras', 'library'],
			value: '/extra',
		},
	]

	const appLayoutData = ctx.host?.appLayoutData
	if (!appLayoutData) return options

	const playground = appLayoutData.playground
	const playgroundPath =
		playground.exerciseNumber && playground.stepNumber
			? getExerciseStepPath(
					playground.exerciseNumber,
					playground.stepNumber,
					playground.type,
				)
			: null
	options.push({
		id: 'playground-exercise',
		title: 'Playground exercise',
		subtitle: playgroundPath ?? 'Not set',
		group: 'Playground',
		keywords: ['playground', 'exercise', 'current'],
		disabled: playgroundPath ? false : true,
		value: playgroundPath ?? '/extra',
	})

	for (const extra of appLayoutData.extras) {
		options.push({
			id: `extra:${extra.dirName}`,
			title: extra.title,
			subtitle: `/extra/${extra.dirName}`,
			group: 'Extras',
			keywords: ['extra', 'extras', extra.title, extra.dirName],
			value: `/extra/${extra.dirName}`,
		})
	}

	for (const exercise of appLayoutData.exercises) {
		const exerciseNumberStr = formatExerciseNumber(exercise.exerciseNumber)
		const exerciseBaseKeywords = [
			'exercise',
			String(exercise.exerciseNumber),
			exerciseNumberStr,
			exercise.title,
		]

		options.push({
			id: `exercise:${exerciseNumberStr}:intro`,
			title: `${exerciseNumberStr}. ${exercise.title} — Intro`,
			subtitle: getExercisePath(exercise.exerciseNumber),
			group: 'Exercises',
			keywords: [...exerciseBaseKeywords, 'intro', 'instructions'],
			value: getExercisePath(exercise.exerciseNumber),
		})

		options.push({
			id: `exercise:${exerciseNumberStr}:finished`,
			title: `${exerciseNumberStr}. ${exercise.title} — Elaboration`,
			subtitle: getExercisePath(exercise.exerciseNumber, 'finished'),
			group: 'Exercises',
			keywords: [...exerciseBaseKeywords, 'finished', 'elaboration'],
			value: getExercisePath(exercise.exerciseNumber, 'finished'),
		})

		for (const step of exercise.steps) {
			const stepNumberStr = step.stepNumber.toString().padStart(2, '0')
			const baseTitle = `${exerciseNumberStr}.${stepNumberStr} ${step.title}`
			const baseKeywords = [
				...exerciseBaseKeywords,
				'step',
				String(step.stepNumber),
				stepNumberStr,
				step.title,
			]

			if (step.problem) {
				options.push({
					id: `exercise:${exerciseNumberStr}:step:${stepNumberStr}:problem`,
					title: `💪 ${baseTitle}`,
					subtitle: getExerciseStepPath(
						exercise.exerciseNumber,
						step.stepNumber,
						'problem',
					),
					group: 'Steps',
					keywords: [...baseKeywords, 'problem'],
					value: getExerciseStepPath(
						exercise.exerciseNumber,
						step.stepNumber,
						'problem',
					),
				})
			}
			if (step.solution) {
				options.push({
					id: `exercise:${exerciseNumberStr}:step:${stepNumberStr}:solution`,
					title: `🏁 ${baseTitle}`,
					subtitle: getExerciseStepPath(
						exercise.exerciseNumber,
						step.stepNumber,
						'solution',
					),
					group: 'Steps',
					keywords: [...baseKeywords, 'solution'],
					value: getExerciseStepPath(
						exercise.exerciseNumber,
						step.stepNumber,
						'solution',
					),
				})
			}
		}
	}

	return options
}

function createDefaultCommands(): CommandPaletteCommand[] {
	return [
		{
			id: 'navigation.go-to',
			title: 'Go to…',
			subtitle: 'Search destinations (pages, exercises, steps, extras)',
			group: 'Navigation',
			keywords: [
				'go to',
				'navigate',
				'exercise',
				'step',
				'problem',
				'solution',
			],
			async run(ctx) {
				const path = await ctx.prompt.select<string>({
					type: 'select',
					title: 'Go to',
					placeholder: 'Search destinations…',
					options: createGoToOptions(ctx),
				})
				if (path === null) {
					// User backed out to the main palette.
					ctx.keepOpen()
					return
				}
				ctx.navigate(path)
			},
		},
		{
			id: 'playground.set-to-current-exercise',
			title: 'Set playground to current exercise',
			group: 'Playground',
			shortcut: 's p',
			keywords: ['playground', 'set'],
			isEnabled() {
				return hasKeyboardAction('s+p')
			},
			run(ctx) {
				ctx.clickKeyboardAction('s+p')
			},
		},
		{
			id: 'playground.reset-to-current-exercise',
			title: 'Reset playground to current exercise',
			group: 'Playground',
			shortcut: 's p p',
			keywords: ['playground', 'reset'],
			isEnabled() {
				return hasKeyboardAction('s+p+p')
			},
			run(ctx) {
				ctx.clickKeyboardAction('s+p+p')
			},
		},
		{
			id: 'help.toggle-keyboard-shortcuts',
			title: 'Toggle keyboard shortcuts',
			subtitle: 'Show the built-in keyboard shortcut reference',
			group: 'Help',
			shortcut: '?',
			keywords: ['help', 'shortcuts', 'keyboard'],
			run() {
				if (!isBrowser()) return
				window.dispatchEvent(new CustomEvent('toggle-keyboard-shortcuts'))
			},
		},
	]
}

export function registerDefaultCommands(controller: CommandPaletteController) {
	const disposers = createDefaultCommands().map((c) =>
		controller.registerCommand(c),
	)
	return () => disposers.forEach((d) => d())
}
