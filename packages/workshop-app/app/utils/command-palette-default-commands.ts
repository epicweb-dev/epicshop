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

function normalizePath(value: string) {
	const trimmed = value.trim()
	if (!trimmed) return null
	if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
		try {
			const url = new URL(trimmed)
			return url.pathname + url.search + url.hash
		} catch {
			return null
		}
	}
	return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

function formatExerciseNumber(n: number) {
	return n.toString().padStart(2, '0')
}

type GoToTarget =
	| { kind: 'path'; path: string }
	| { kind: 'prompt.path' }

function createGoToOptions(
	ctx: Parameters<CommandPaletteCommand['run']>[0],
): Array<CommandPaletteSelectOption<GoToTarget>> {
	const options: Array<CommandPaletteSelectOption<GoToTarget>> = [
		{
			id: 'home',
			title: 'Home',
			subtitle: '/',
			group: 'Pages',
			keywords: ['home', 'start'],
			value: { kind: 'path', path: '/' },
		},
		{
			id: 'account',
			title: 'Account',
			subtitle: '/account',
			group: 'Pages',
			keywords: ['account', 'profile', 'user'],
			value: { kind: 'path', path: '/account' },
		},
		{
			id: 'admin',
			title: 'Admin',
			subtitle: '/admin',
			group: 'Pages',
			keywords: ['admin', 'processes', 'sidecar', 'status'],
			value: { kind: 'path', path: '/admin' },
		},
		{
			id: 'workshop-feedback',
			title: 'Workshop feedback',
			subtitle: '/finished',
			group: 'Pages',
			keywords: ['feedback', 'workshop', 'finished'],
			value: { kind: 'path', path: '/finished' },
		},
		{
			id: 'last-exercise-solution',
			title: 'Last exercise solution',
			subtitle: '/l',
			group: 'Pages',
			keywords: ['last', 'final', 'solution'],
			value: { kind: 'path', path: '/l' },
		},
		{
			id: 'extras',
			title: 'Extras',
			subtitle: '/extra',
			group: 'Pages',
			keywords: ['extra', 'extras', 'library'],
			value: { kind: 'path', path: '/extra' },
		},
		{
			id: 'path',
			title: 'Path…',
			subtitle: 'Enter a URL path (e.g. /exercise/01/01/problem)',
			group: 'Advanced',
			keywords: ['path', 'url', 'navigate'],
			value: { kind: 'prompt.path' },
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
		value: playgroundPath
			? { kind: 'path', path: playgroundPath }
			: { kind: 'prompt.path' },
	})

	for (const extra of appLayoutData.extras) {
		options.push({
			id: `extra:${extra.dirName}`,
			title: extra.title,
			subtitle: `/extra/${extra.dirName}`,
			group: 'Extras',
			keywords: ['extra', 'extras', extra.title, extra.dirName],
			value: { kind: 'path', path: `/extra/${extra.dirName}` },
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
			value: { kind: 'path', path: getExercisePath(exercise.exerciseNumber) },
		})

		options.push({
			id: `exercise:${exerciseNumberStr}:finished`,
			title: `${exerciseNumberStr}. ${exercise.title} — Elaboration`,
			subtitle: getExercisePath(exercise.exerciseNumber, 'finished'),
			group: 'Exercises',
			keywords: [...exerciseBaseKeywords, 'finished', 'elaboration'],
			value: {
				kind: 'path',
				path: getExercisePath(exercise.exerciseNumber, 'finished'),
			},
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

			options.push({
				id: `exercise:${exerciseNumberStr}:step:${stepNumberStr}:instructions`,
				title: `${baseTitle} — Instructions`,
				subtitle: getExerciseStepPath(exercise.exerciseNumber, step.stepNumber),
				group: 'Steps',
				keywords: [...baseKeywords, 'instructions'],
				value: {
					kind: 'path',
					path: getExerciseStepPath(exercise.exerciseNumber, step.stepNumber),
				},
			})

			if (step.problem) {
				options.push({
					id: `exercise:${exerciseNumberStr}:step:${stepNumberStr}:problem`,
					title: `${baseTitle} — Problem`,
					subtitle: getExerciseStepPath(
						exercise.exerciseNumber,
						step.stepNumber,
						'problem',
					),
					group: 'Steps',
					keywords: [...baseKeywords, 'problem'],
					value: {
						kind: 'path',
						path: getExerciseStepPath(
							exercise.exerciseNumber,
							step.stepNumber,
							'problem',
						),
					},
				})
			}
			if (step.solution) {
				options.push({
					id: `exercise:${exerciseNumberStr}:step:${stepNumberStr}:solution`,
					title: `${baseTitle} — Solution`,
					subtitle: getExerciseStepPath(
						exercise.exerciseNumber,
						step.stepNumber,
						'solution',
					),
					group: 'Steps',
					keywords: [...baseKeywords, 'solution'],
					value: {
						kind: 'path',
						path: getExerciseStepPath(
							exercise.exerciseNumber,
							step.stepNumber,
							'solution',
						),
					},
				})
			}
		}
	}

	return options
}

function createDefaultCommands(): CommandPaletteCommand[] {
	return [
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
		{
			id: 'navigation.go-next',
			title: 'Go to next step/page',
			group: 'Navigation',
			shortcut: 'g n',
			keywords: ['next', 'forward', 'navigation'],
			isEnabled() {
				return hasKeyboardAction('g+n')
			},
			run(ctx) {
				ctx.clickKeyboardAction('g+n')
			},
		},
		{
			id: 'navigation.go-previous',
			title: 'Go to previous step/page',
			group: 'Navigation',
			shortcut: 'g p',
			keywords: ['previous', 'back', 'navigation'],
			isEnabled() {
				return hasKeyboardAction('g+p')
			},
			run(ctx) {
				ctx.clickKeyboardAction('g+p')
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
			id: 'navigation.go-to',
			title: 'Go to…',
			subtitle: 'Search destinations (pages, exercises, steps, extras)',
			group: 'Navigation',
			keywords: ['go to', 'navigate', 'exercise', 'step', 'problem', 'solution'],
			async run(ctx) {
				const target = await ctx.prompt.select<GoToTarget>({
					type: 'select',
					title: 'Go to',
					placeholder: 'Search destinations…',
					options: createGoToOptions(ctx),
				})
				if (!target) return

				if (target.kind === 'path') {
					ctx.navigate(target.path)
					return
				}

				const raw = await ctx.prompt.text({
					type: 'text',
					title: 'Go to path',
					placeholder: '/exercise/01/01/problem',
					validate(value) {
						const normalized = normalizePath(value)
						return normalized ? null : 'Enter a path.'
					},
				})
				const path = raw ? normalizePath(raw) : null
				if (path) ctx.navigate(path)
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
