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

type ExerciseFromLayout = NonNullable<
	NonNullable<Parameters<CommandPaletteCommand['run']>[0]['host']>['appLayoutData']
>['exercises'][number]

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
			id: 'navigation.go-home',
			title: 'Go to home',
			group: 'Navigation',
			shortcut: 'g h',
			keywords: ['home', 'navigation'],
			run(ctx) {
				ctx.navigate('/')
			},
		},
		{
			id: 'navigation.go-account',
			title: 'Go to account',
			group: 'Navigation',
			shortcut: 'g a',
			keywords: ['account', 'profile', 'navigation'],
			run(ctx) {
				ctx.navigate('/account')
			},
		},
		{
			id: 'navigation.go-admin',
			title: 'Go to admin',
			group: 'Navigation',
			shortcut: 'g d',
			keywords: ['admin', 'server', 'processes', 'navigation'],
			run(ctx) {
				ctx.navigate('/admin')
			},
		},
		{
			id: 'navigation.go-last-exercise-solution',
			title: 'Go to last exercise solution',
			group: 'Navigation',
			shortcut: 'g l',
			keywords: ['last', 'final', 'solution', 'navigation'],
			run(ctx) {
				ctx.navigate('/l')
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
			id: 'playground.go-to-playground-exercise',
			title: 'Go to playground exercise',
			group: 'Playground',
			shortcut: 'g o',
			keywords: ['playground', 'exercise', 'navigation'],
			isEnabled(ctx) {
				const pg = ctx.host?.appLayoutData?.playground
				if (pg?.exerciseNumber && pg.stepNumber) return true
				return hasKeyboardAction('g+o')
			},
			run(ctx) {
				const pg = ctx.host?.appLayoutData?.playground
				if (pg?.exerciseNumber && pg.stepNumber) {
					ctx.navigate(
						getExerciseStepPath(pg.exerciseNumber, pg.stepNumber, pg.type),
					)
					return
				}
				ctx.clickKeyboardAction('g+o')
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
			id: 'navigation.go-to-exercise-page',
			title: 'Go to exercise page…',
			subtitle: 'Pick an exercise, then pick a page',
			group: 'Navigation',
			keywords: ['go to', 'exercise', 'step', 'problem', 'solution', 'finished'],
			async run(ctx) {
				const exercises = ctx.host?.appLayoutData?.exercises ?? []
				if (!exercises.length) {
					const raw = await ctx.prompt.text({
						type: 'text',
						title: 'Go to path',
						placeholder: '/exercise/01',
						validate(value) {
							const normalized = normalizePath(value)
							return normalized ? null : 'Enter a path.'
						},
					})
					const path = raw ? normalizePath(raw) : null
					if (path) ctx.navigate(path)
					return
				}

				const exercise = await ctx.prompt.select<ExerciseFromLayout>({
					type: 'select',
					title: 'Go to exercise',
					placeholder: 'Search exercises…',
					options: exercises.map((e) => ({
						id: String(e.exerciseNumber),
						title: `${formatExerciseNumber(e.exerciseNumber)}. ${e.title}`,
						keywords: [
							String(e.exerciseNumber),
							formatExerciseNumber(e.exerciseNumber),
							e.title,
						],
						value: e,
					})),
				})
				if (!exercise) return

				const dest = await ctx.prompt.select<{ path: string }>({
					type: 'select',
					title: `Exercise ${formatExerciseNumber(exercise.exerciseNumber)}`,
					placeholder: 'Search pages…',
					options: [
						{
							id: 'intro',
							title: 'Intro',
							subtitle: getExercisePath(exercise.exerciseNumber),
							keywords: ['intro', 'instructions', 'start'],
							group: 'Exercise',
							value: { path: getExercisePath(exercise.exerciseNumber) },
						},
						{
							id: 'finished',
							title: 'Elaboration',
							subtitle: getExercisePath(exercise.exerciseNumber, 'finished'),
							keywords: ['finished', 'elaboration', 'final'],
							group: 'Exercise',
							value: {
								path: getExercisePath(exercise.exerciseNumber, 'finished'),
							},
						},
						...exercise.steps.flatMap((step) => {
							const stepLabel = `${step.stepNumber.toString().padStart(2, '0')}. ${
								step.title
							}`
							const base = {
								keywords: [
									`step ${step.stepNumber}`,
									step.stepNumber.toString(),
									step.title,
								],
								group: 'Steps',
							}
							const options: Array<
								CommandPaletteSelectOption<{ path: string }>
							> = []
							options.push({
								id: `step-${step.stepNumber}-instructions`,
								title: `${stepLabel} — Instructions`,
								subtitle: getExerciseStepPath(
									exercise.exerciseNumber,
									step.stepNumber,
								),
								...base,
								keywords: [...base.keywords, 'instructions'],
								value: {
									path: getExerciseStepPath(
										exercise.exerciseNumber,
										step.stepNumber,
									),
								},
							})
							if (step.problem) {
								options.push({
									id: `step-${step.stepNumber}-problem`,
									title: `${stepLabel} — Problem`,
									subtitle: getExerciseStepPath(
										exercise.exerciseNumber,
										step.stepNumber,
										'problem',
									),
									...base,
									keywords: [...base.keywords, 'problem'],
									value: {
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
									id: `step-${step.stepNumber}-solution`,
									title: `${stepLabel} — Solution`,
									subtitle: getExerciseStepPath(
										exercise.exerciseNumber,
										step.stepNumber,
										'solution',
									),
									...base,
									keywords: [...base.keywords, 'solution'],
									value: {
										path: getExerciseStepPath(
											exercise.exerciseNumber,
											step.stepNumber,
											'solution',
										),
									},
								})
							}
							return options
						}),
					],
				})
				if (!dest) return

				ctx.navigate(dest.path)
			},
		},
		{
			id: 'navigation.go-to-path',
			title: 'Go to path…',
			subtitle: 'Enter a URL path like /exercise/01/02/problem',
			group: 'Navigation',
			keywords: ['go to', 'path', 'url', 'navigate'],
			async run(ctx) {
				const raw = await ctx.prompt.text({
					type: 'text',
					title: 'Go to path',
					placeholder: '/exercise/01',
					validate(value) {
						const normalized = normalizePath(value)
						return normalized ? null : 'Enter a path.'
					},
				})
				const path = raw ? normalizePath(raw) : null
				if (path) ctx.navigate(path)
			},
		},
		{
			id: 'navigation.go-to-exercise-number',
			title: 'Go to exercise number…',
			subtitle: 'Enter an exercise number like 1',
			group: 'Navigation',
			keywords: ['go to', 'exercise', 'number'],
			async run(ctx) {
				const max = Math.max(
					1,
					...(ctx.host?.appLayoutData?.exercises ?? []).map((e) => e.exerciseNumber),
				)
				const exerciseNumber = await ctx.prompt.number({
					type: 'number',
					title: 'Go to exercise number',
					placeholder: '1',
					min: 1,
					max,
				})
				if (exerciseNumber === null) return
				ctx.navigate(getExercisePath(exerciseNumber))
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

