import { matchSorter, rankings } from 'match-sorter'
import { clickKeyboardAction } from '#app/utils/keyboard-action.ts'

export type CommandPaletteScope = string

export type CommandPaletteHost = {
	/**
	 * React Router navigate function (preferred). If not provided, navigation
	 * falls back to `window.location.assign`.
	 */
	navigate?: (to: string) => void
	/**
	 * Current pathname (optional; enables context-sensitive commands).
	 */
	pathname?: string
	/**
	 * Loader data from `_app+/_layout` (optional; enables exercise-aware commands).
	 */
	appLayoutData?: {
		exercises: Array<{
			exerciseNumber: number
			title: string
			steps: Array<{
				stepNumber: number
				title: string
				problem: { name: string; title: string } | null
				solution: { name: string; title: string } | null
			}>
		}>
		playground: {
			appName: string | null
			exerciseNumber: number | null
			stepNumber: number | null
			type: 'problem' | 'solution' | undefined
		}
		extras: Array<{ dirName: string; title: string; name: string }>
	} | null
	/**
	 * Root loader data (optional; enables auth-sensitive commands).
	 */
	rootData?: {
		user?: { id: string; name?: string | null; email?: string | null } | null
		userHasAccess?: boolean | null
	}
}

export type CommandPaletteFilter = {
	includeIds?: string[]
	excludeIds?: string[]
	includeScopes?: CommandPaletteScope[]
	excludeScopes?: CommandPaletteScope[]
	predicate?: (
		command: CommandPaletteResolvedCommand,
		ctx: CommandPaletteCommandContext,
	) => boolean
}

export type CommandPaletteOpenOptions = {
	filter?: CommandPaletteFilter
	placeholder?: string
}

export type CommandPaletteEntry =
	| (CommandPaletteEntryBase & {
			kind: 'command'
			commandId: string
	  })
	| (CommandPaletteEntryBase & {
			kind: 'option'
			promptId: string
			optionId: string
	  })

type CommandPaletteEntryBase = {
	id: string
	title: string
	subtitle?: string
	group?: string
	shortcut?: string
	disabled: boolean
	keywords: string[]
}

export type CommandPaletteState = {
	open: boolean
	/**
	 * A stack of views so commands can ask for multiple inputs.
	 */
	viewStack: CommandPaletteView[]
	entries: CommandPaletteEntry[]
	errorMessage: string | null
	isExecuting: boolean
}

export type CommandPaletteView =
	| {
			type: 'commands'
			placeholder: string
			query: string
			selectedIndex: number
	  }
	| {
			type: 'select'
			promptId: string
			title: string
			placeholder: string
			query: string
			selectedIndex: number
	  }
	| {
			type: 'text'
			promptId: string
			title: string
			placeholder: string
			description?: string
			query: string
			selectedIndex: number
	  }
	| {
			type: 'number'
			promptId: string
			title: string
			placeholder: string
			description?: string
			query: string
			selectedIndex: number
	  }

export type CommandPaletteCommand = {
	id: string
	title: string | ((ctx: CommandPaletteCommandContext) => string)
	subtitle?:
		| string
		| ((ctx: CommandPaletteCommandContext) => string | undefined)
	keywords?: string[] | ((ctx: CommandPaletteCommandContext) => string[])
	group?: string | ((ctx: CommandPaletteCommandContext) => string | undefined)
	shortcut?:
		| string
		| ((ctx: CommandPaletteCommandContext) => string | undefined)
	scopes?: CommandPaletteScope[]
	isVisible?: (ctx: CommandPaletteCommandContext) => boolean
	isEnabled?: (ctx: CommandPaletteCommandContext) => boolean
	run: (ctx: CommandPaletteCommandContext) => void | Promise<void>
}

export type CommandPaletteResolvedCommand = {
	id: string
	title: string
	subtitle?: string
	keywords: string[]
	group?: string
	shortcut?: string
	scopes: CommandPaletteScope[]
	enabled: boolean
	visible: boolean
	run: CommandPaletteCommand['run']
}

export type CommandPaletteSelectOption<TValue> = {
	id: string
	title: string
	subtitle?: string
	keywords?: string[]
	group?: string
	shortcut?: string
	disabled?: boolean
} & (
	| {
			value: TValue
			/**
			 * Optional chained input step. If provided, selecting this option opens
			 * the follow-up prompt and only resolves the parent select once that
			 * prompt yields a value.
			 */
			getValue?: never
	  }
	| {
			value?: TValue
			getValue: (ctx: CommandPaletteCommandContext) => Promise<TValue | null>
	  }
)

export type CommandPalettePrompt =
	| {
			type: 'select'
			title: string
			placeholder?: string
			options: Array<CommandPaletteSelectOption<unknown>>
	  }
	| {
			type: 'text'
			title: string
			placeholder?: string
			description?: string
			defaultValue?: string
			validate?: (value: string) => string | null
	  }
	| {
			type: 'number'
			title: string
			placeholder?: string
			description?: string
			defaultValue?: number
			min?: number
			max?: number
			validate?: (value: number) => string | null
	  }

export type CommandPaletteCommandContext = {
	host: CommandPaletteHost | null
	close: () => void
	keepOpen: () => void
	navigate: (to: string) => void
	clickKeyboardAction: (action: string | string[]) => boolean
	prompt: {
		select: <TValue>(
			prompt: Omit<
				Extract<CommandPalettePrompt, { type: 'select' }>,
				'options'
			> & { options: Array<CommandPaletteSelectOption<TValue>> },
		) => Promise<TValue | null>
		text: (
			prompt: Extract<CommandPalettePrompt, { type: 'text' }>,
		) => Promise<string | null>
		number: (
			prompt: Extract<CommandPalettePrompt, { type: 'number' }>,
		) => Promise<number | null>
	}
}

type Listener = () => void

function isBrowser() {
	return typeof window !== 'undefined' && typeof document !== 'undefined'
}

function createId(prefix: string) {
	return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

function getCommandTitle(
	command: CommandPaletteCommand,
	ctx: CommandPaletteCommandContext,
) {
	return typeof command.title === 'function'
		? command.title(ctx)
		: command.title
}

function getMaybe(
	value:
		| string
		| ((ctx: CommandPaletteCommandContext) => string | undefined)
		| undefined,
	ctx: CommandPaletteCommandContext,
) {
	return typeof value === 'function' ? value(ctx) : value
}

function getKeywords(
	keywords:
		| string[]
		| ((ctx: CommandPaletteCommandContext) => string[])
		| undefined,
	ctx: CommandPaletteCommandContext,
) {
	const list = typeof keywords === 'function' ? keywords(ctx) : keywords
	return (list ?? []).filter(Boolean)
}

class CommandRegistry {
	#commands = new Map<string, CommandPaletteCommand>()
	#order: string[] = []
	#listeners = new Set<Listener>()

	subscribe(listener: Listener) {
		this.#listeners.add(listener)
		return () => this.#listeners.delete(listener)
	}

	register(command: CommandPaletteCommand) {
		const existing = this.#commands.get(command.id)
		this.#commands.set(command.id, command)
		if (!existing) {
			this.#order.push(command.id)
		}
		this.#emit()
		return () => {
			// Only remove if the current command is the same instance we registered.
			if (this.#commands.get(command.id) === command) {
				this.unregister(command.id)
			}
		}
	}

	unregister(commandId: string) {
		const didDelete = this.#commands.delete(commandId)
		if (didDelete) {
			this.#order = this.#order.filter((id) => id !== commandId)
			this.#emit()
		}
	}

	list() {
		return this.#order
			.map((id) => this.#commands.get(id))
			.filter(Boolean) as Array<CommandPaletteCommand>
	}

	#emit() {
		for (const l of this.#listeners) l()
	}
}

type ActivePrompt =
	| {
			type: 'select'
			promptId: string
			title: string
			placeholder: string
			options: Array<CommandPaletteSelectOption<unknown>>
			resolve: (value: unknown | null) => void
	  }
	| {
			type: 'text'
			promptId: string
			title: string
			placeholder: string
			description?: string
			validate?: (value: string) => string | null
			resolve: (value: string | null) => void
	  }
	| {
			type: 'number'
			promptId: string
			title: string
			placeholder: string
			description?: string
			min?: number
			max?: number
			validate?: (value: number) => string | null
			resolve: (value: number | null) => void
	  }

export class CommandPaletteController {
	#registry = new CommandRegistry()
	#host: CommandPaletteHost | null = null
	#openOptions: CommandPaletteOpenOptions | null = null
	#listeners = new Set<Listener>()
	#activePrompts = new Map<string, ActivePrompt>()
	#keepOpenAfterRun = false
	#state: CommandPaletteState = {
		open: false,
		viewStack: [
			{
				type: 'commands',
				placeholder: 'Type a command…',
				query: '',
				selectedIndex: 0,
			},
		],
		entries: [],
		errorMessage: null,
		isExecuting: false,
	}

	constructor() {
		this.#registry.subscribe(() => {
			if (!this.#state.open) return
			this.#recomputeEntries()
		})
	}

	subscribe(listener: Listener) {
		this.#listeners.add(listener)
		return () => this.#listeners.delete(listener)
	}

	getSnapshot() {
		return this.#state
	}

	setHost(host: CommandPaletteHost | null) {
		this.#host = host
		if (this.#state.open) {
			this.#recomputeEntries()
		}
	}

	registerCommand(command: CommandPaletteCommand) {
		return this.#registry.register(command)
	}

	unregisterCommand(commandId: string) {
		this.#registry.unregister(commandId)
	}

	isOpen() {
		return this.#state.open
	}

	open(options: CommandPaletteOpenOptions = {}) {
		this.#openOptions = options
		this.#keepOpenAfterRun = false
		this.#setState({
			open: true,
			viewStack: [
				{
					type: 'commands',
					placeholder: options.placeholder ?? 'Type a command…',
					query: '',
					selectedIndex: 0,
				},
			],
			entries: [],
			errorMessage: null,
			isExecuting: false,
		})
		this.#recomputeEntries()
	}

	close() {
		// Cancel any pending prompts with `null` so command handlers can bail out.
		for (const prompt of this.#activePrompts.values()) {
			prompt.resolve(null)
		}
		this.#activePrompts.clear()
		this.#openOptions = null
		this.#keepOpenAfterRun = false
		this.#setState({
			open: false,
			errorMessage: null,
			isExecuting: false,
			entries: [],
			viewStack: [
				{
					type: 'commands',
					placeholder: 'Type a command…',
					query: '',
					selectedIndex: 0,
				},
			],
		})
	}

	back() {
		if (!this.#state.open) return
		const stack = this.#state.viewStack
		if (stack.length <= 1) {
			this.close()
			return
		}
		const active = stack[stack.length - 1]
		if (!active) return
		const nextStack = stack.slice(0, -1)
		const nextActive = nextStack[nextStack.length - 1]
		if ('promptId' in active) {
			const prompt = this.#activePrompts.get(active.promptId)
			const shouldKeepOpenAfterRun =
				prompt?.type === 'text' || prompt?.type === 'number'
			// Resolve as cancelled before popping.
			prompt?.resolve(null)
			this.#activePrompts.delete(active.promptId)
			if (shouldKeepOpenAfterRun && nextActive?.type === 'commands') {
				this.#keepOpenAfterRun = true
			}
		}
		this.#setState({
			viewStack: nextStack,
			errorMessage: null,
		})
		this.#recomputeEntries()
	}

	setQuery(query: string) {
		if (!this.#state.open) return
		const stack = this.#state.viewStack
		const active = stack[stack.length - 1]
		if (!active) return
		const nextActive = {
			...active,
			query,
			selectedIndex: 0,
		} as CommandPaletteView
		this.#setState({
			viewStack: [...stack.slice(0, -1), nextActive],
			errorMessage: null,
		})
		this.#recomputeEntries()
	}

	moveSelection(delta: number) {
		if (!this.#state.open) return
		const stack = this.#state.viewStack
		const active = stack[stack.length - 1]
		if (!active) return
		const maxIndex = Math.max(0, this.#state.entries.length - 1)
		const selectedIndex = Math.min(
			maxIndex,
			Math.max(0, active.selectedIndex + delta),
		)
		if (selectedIndex === active.selectedIndex) return
		const nextActive = { ...active, selectedIndex } as CommandPaletteView
		this.#setState({
			viewStack: [...stack.slice(0, -1), nextActive],
		})
	}

	setSelection(index: number) {
		if (!this.#state.open) return
		const stack = this.#state.viewStack
		const active = stack[stack.length - 1]
		if (!active) return
		const maxIndex = Math.max(0, this.#state.entries.length - 1)
		const selectedIndex = Math.min(maxIndex, Math.max(0, index))
		if (selectedIndex === active.selectedIndex) return
		const nextActive = { ...active, selectedIndex } as CommandPaletteView
		this.#setState({
			viewStack: [...stack.slice(0, -1), nextActive],
		})
	}

	async submitSelected() {
		const stack = this.#state.viewStack
		const active = stack[stack.length - 1]
		if (!active) return
		const entry = this.#state.entries[active.selectedIndex]
		if (!entry || entry.disabled) return

		if (entry.kind === 'command') {
			await this.#runCommand(entry.commandId)
			return
		}

		// prompt option selection
		const prompt = this.#activePrompts.get(entry.promptId)
		if (!prompt || prompt.type !== 'select') return
		const option = prompt.options.find((o) => o.id === entry.optionId)
		if (!option || option.disabled) return

		if ('getValue' in option && typeof option.getValue === 'function') {
			const ctx = this.#createCommandContext()
			const value = await option.getValue(ctx)
			if (!this.#state.open) return
			// If the follow-up prompt was canceled, keep the parent select open.
			if (value === null) {
				this.#setState({ errorMessage: null })
				this.#recomputeEntries()
				return
			}

			prompt.resolve(value)
		} else {
			prompt.resolve(option.value)
		}

		this.#activePrompts.delete(prompt.promptId)

		// Pop the active select view (it should be on top at this point).
		const currentStack = this.#state.viewStack
		const last = currentStack[currentStack.length - 1]
		const shouldPopLast =
			last && 'promptId' in last && last.promptId === prompt.promptId
		this.#setState({
			viewStack: shouldPopLast ? currentStack.slice(0, -1) : currentStack,
			errorMessage: null,
		})
		this.#recomputeEntries()
	}

	async submitCurrentInput() {
		const stack = this.#state.viewStack
		const active = stack[stack.length - 1]
		if (!active) return
		if (!('promptId' in active)) return
		const prompt = this.#activePrompts.get(active.promptId)
		if (!prompt) return

		if (prompt.type === 'text') {
			const value = active.query
			const error = prompt.validate?.(value) ?? null
			if (error) {
				this.#setState({ errorMessage: error })
				return
			}
			prompt.resolve(value)
			this.#activePrompts.delete(prompt.promptId)
			this.#setState({
				viewStack: stack.slice(0, -1),
				errorMessage: null,
			})
			this.#recomputeEntries()
			return
		}

		if (prompt.type === 'number') {
			const raw = active.query.trim()
			const n = raw === '' ? NaN : Number(raw)
			if (!Number.isFinite(n)) {
				this.#setState({ errorMessage: 'Enter a valid number.' })
				return
			}
			if (typeof prompt.min === 'number' && n < prompt.min) {
				this.#setState({ errorMessage: `Must be >= ${prompt.min}.` })
				return
			}
			if (typeof prompt.max === 'number' && n > prompt.max) {
				this.#setState({ errorMessage: `Must be <= ${prompt.max}.` })
				return
			}
			const error = prompt.validate?.(n) ?? null
			if (error) {
				this.#setState({ errorMessage: error })
				return
			}
			prompt.resolve(n)
			this.#activePrompts.delete(prompt.promptId)
			this.#setState({
				viewStack: stack.slice(0, -1),
				errorMessage: null,
			})
			this.#recomputeEntries()
		}
	}

	#createCommandContext(): CommandPaletteCommandContext {
		const controller = this
		return {
			host: this.#host,
			close() {
				controller.close()
			},
			keepOpen() {
				controller.#keepOpenAfterRun = true
			},
			navigate(to: string) {
				if (controller.#host?.navigate) {
					controller.#host.navigate(to)
					return
				}
				if (isBrowser()) {
					window.location.assign(to)
				}
			},
			clickKeyboardAction,
			prompt: {
				select<TValue>(
					prompt: Omit<
						Extract<CommandPalettePrompt, { type: 'select' }>,
						'options'
					> & { options: Array<CommandPaletteSelectOption<TValue>> },
				) {
					return controller.#promptSelect<TValue>(prompt)
				},
				text(prompt: Extract<CommandPalettePrompt, { type: 'text' }>) {
					return controller.#promptText(prompt)
				},
				number(prompt: Extract<CommandPalettePrompt, { type: 'number' }>) {
					return controller.#promptNumber(prompt)
				},
			},
		}
	}

	#resolveCommands() {
		const ctx = this.#createCommandContext()
		const filter = this.#openOptions?.filter
		const includeIds = new Set(filter?.includeIds ?? [])
		const excludeIds = new Set(filter?.excludeIds ?? [])
		const includeScopes = new Set(filter?.includeScopes ?? [])
		const excludeScopes = new Set(filter?.excludeScopes ?? [])

		const commands = this.#registry.list().map((command) => {
			const resolved: CommandPaletteResolvedCommand = {
				id: command.id,
				title: getCommandTitle(command, ctx),
				subtitle: getMaybe(command.subtitle, ctx),
				keywords: getKeywords(command.keywords, ctx),
				group: getMaybe(command.group, ctx),
				shortcut: getMaybe(command.shortcut, ctx),
				scopes: command.scopes ?? [],
				enabled: command.isEnabled ? command.isEnabled(ctx) : true,
				visible: command.isVisible ? command.isVisible(ctx) : true,
				run: command.run,
			}
			return resolved
		})

		return commands.filter((command) => {
			if (!command.visible) return false
			if (includeIds.size > 0 && !includeIds.has(command.id)) return false
			if (excludeIds.has(command.id)) return false
			if (includeScopes.size > 0) {
				if (!command.scopes.some((s) => includeScopes.has(s))) return false
			}
			if (excludeScopes.size > 0) {
				if (command.scopes.some((s) => excludeScopes.has(s))) return false
			}
			if (filter?.predicate && !filter.predicate(command, ctx)) return false
			return true
		})
	}

	#recomputeEntries() {
		if (!this.#state.open) return
		const stack = this.#state.viewStack
		const active = stack[stack.length - 1]
		if (!active) return
		const query = active.query.trim()

		if (active.type === 'commands') {
			const commands = this.#resolveCommands()
			const items = query
				? matchSorter(commands, query, {
						keys: ['title', 'subtitle', 'keywords', 'id', 'group', 'shortcut'],
						threshold: rankings.CONTAINS,
					})
				: commands
			const entries: CommandPaletteEntry[] = items.map((command) => {
				const keywords = [
					command.id,
					command.title,
					command.subtitle,
					command.group,
					command.shortcut,
					...command.keywords,
				].filter(Boolean) as string[]
				return {
					kind: 'command',
					id: `command:${command.id}`,
					commandId: command.id,
					title: command.title,
					subtitle: command.subtitle,
					group: command.group,
					shortcut: command.shortcut,
					disabled: !command.enabled || this.#state.isExecuting,
					keywords,
				}
			})
			const selectedIndex = clampIndex(active.selectedIndex, entries.length)
			const nextActive = { ...active, selectedIndex } as CommandPaletteView
			this.#setState({
				entries,
				viewStack: [...stack.slice(0, -1), nextActive],
			})
			return
		}

		const prompt = this.#activePrompts.get(active.promptId)
		if (!prompt) {
			this.#setState({ entries: [] })
			return
		}

		if (prompt.type === 'select') {
			const options = prompt.options.map((o) => ({
				...o,
				keywords: [
					o.id,
					o.title,
					o.subtitle,
					o.group,
					o.shortcut,
					...(o.keywords ?? []),
				].filter(Boolean) as string[],
			}))
			const filtered = query
				? matchSorter(options, query, {
						keys: ['title', 'subtitle', 'keywords', 'id', 'group', 'shortcut'],
						threshold: rankings.CONTAINS,
					})
				: options
			const entries: CommandPaletteEntry[] = filtered.map((o) => ({
				kind: 'option',
				id: `option:${prompt.promptId}:${o.id}`,
				promptId: prompt.promptId,
				optionId: o.id,
				title: o.title,
				subtitle: o.subtitle,
				group: o.group,
				shortcut: o.shortcut,
				disabled: Boolean(o.disabled),
				keywords: o.keywords ?? [],
			}))
			const selectedIndex = clampIndex(active.selectedIndex, entries.length)
			const nextActive = { ...active, selectedIndex } as CommandPaletteView
			this.#setState({
				entries,
				viewStack: [...stack.slice(0, -1), nextActive],
			})
			return
		}

		// text/number prompts don't have entries (at least for now).
		this.#setState({ entries: [] })
	}

	async #runCommand(commandId: string) {
		const commands = this.#resolveCommands()
		const command = commands.find((c) => c.id === commandId)
		if (!command || !command.enabled) return

		this.#keepOpenAfterRun = false
		this.#setState({ isExecuting: true, errorMessage: null })
		this.#recomputeEntries()
		try {
			const ctx = this.#createCommandContext()
			await command.run(ctx)
			// If we’re still open and not in a prompt, close by default.
			if (this.#state.open) {
				const stack = this.#state.viewStack
				const active = stack[stack.length - 1]
				if (!active) return
				const inPrompt = active.type !== 'commands'
				if (!inPrompt && !this.#keepOpenAfterRun) {
					this.close()
					return
				}
			}
		} catch (e) {
			const message =
				e instanceof Error ? e.message : 'Command failed unexpectedly.'
			this.#setState({ errorMessage: message })
		} finally {
			if (this.#state.open) {
				this.#setState({ isExecuting: false })
				this.#recomputeEntries()
			}
		}
	}

	#promptSelect<TValue>({
		title,
		placeholder,
		options,
	}: Omit<Extract<CommandPalettePrompt, { type: 'select' }>, 'options'> & {
		options: Array<CommandPaletteSelectOption<TValue>>
	}) {
		const promptId = createId('prompt')
		const stack = this.#state.viewStack
		const promptPlaceholder = placeholder ?? 'Search…'
		const promise = new Promise<TValue | null>((resolve) => {
			this.#activePrompts.set(promptId, {
				type: 'select',
				promptId,
				title,
				placeholder: promptPlaceholder,
				options: options as Array<CommandPaletteSelectOption<unknown>>,
				resolve: resolve as (value: unknown | null) => void,
			})
		})

		this.#setState({
			viewStack: [
				...stack,
				{
					type: 'select',
					promptId,
					title,
					placeholder: promptPlaceholder,
					query: '',
					selectedIndex: 0,
				},
			],
			errorMessage: null,
		})
		this.#recomputeEntries()
		return promise
	}

	#promptText(prompt: Extract<CommandPalettePrompt, { type: 'text' }>) {
		const promptId = createId('prompt')
		const stack = this.#state.viewStack
		const promptPlaceholder = prompt.placeholder ?? 'Type…'
		const promise = new Promise<string | null>((resolve) => {
			this.#activePrompts.set(promptId, {
				type: 'text',
				promptId,
				title: prompt.title,
				placeholder: promptPlaceholder,
				description: prompt.description,
				validate: prompt.validate,
				resolve,
			})
		})

		this.#setState({
			viewStack: [
				...stack,
				{
					type: 'text',
					promptId,
					title: prompt.title,
					placeholder: promptPlaceholder,
					description: prompt.description,
					query: prompt.defaultValue ?? '',
					selectedIndex: 0,
				},
			],
			errorMessage: null,
		})
		this.#recomputeEntries()
		return promise
	}

	#promptNumber(prompt: Extract<CommandPalettePrompt, { type: 'number' }>) {
		const promptId = createId('prompt')
		const stack = this.#state.viewStack
		const promptPlaceholder = prompt.placeholder ?? 'Enter a number…'
		const promise = new Promise<number | null>((resolve) => {
			this.#activePrompts.set(promptId, {
				type: 'number',
				promptId,
				title: prompt.title,
				placeholder: promptPlaceholder,
				description: prompt.description,
				min: prompt.min,
				max: prompt.max,
				validate: prompt.validate,
				resolve,
			})
		})

		this.#setState({
			viewStack: [
				...stack,
				{
					type: 'number',
					promptId,
					title: prompt.title,
					placeholder: promptPlaceholder,
					description: prompt.description,
					query:
						typeof prompt.defaultValue === 'number'
							? String(prompt.defaultValue)
							: '',
					selectedIndex: 0,
				},
			],
			errorMessage: null,
		})
		this.#recomputeEntries()
		return promise
	}

	#setState(partial: Partial<CommandPaletteState>) {
		this.#state = { ...this.#state, ...partial }
		for (const l of this.#listeners) l()
	}
}

function clampIndex(index: number, length: number) {
	if (length <= 0) return 0
	return Math.min(length - 1, Math.max(0, index))
}

export const commandPaletteController = new CommandPaletteController()
