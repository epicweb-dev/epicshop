import * as DialogPrimitive from '@radix-ui/react-dialog'
import * as React from 'react'
import { useLocation, useMatches, useNavigate } from 'react-router'
import {
	commandPaletteController,
	type CommandPaletteHost,
	type CommandPaletteState,
} from '#app/utils/command-palette.ts'
import { cn } from '#app/utils/misc.tsx'
import { Dialog, DialogOverlay, DialogPortal } from './ui/dialog'

function subscribe(listener: () => void) {
	return commandPaletteController.subscribe(listener)
}

function getSnapshot() {
	return commandPaletteController.getSnapshot()
}

function CommandPaletteContent({
	className,
	children,
	...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) {
	return (
		<DialogPortal>
			<DialogOverlay />
			<DialogPrimitive.Content
				className={cn(
					'bg-background fixed top-[20vh] left-[50%] z-50 w-[min(720px,calc(100vw-2rem))] translate-x-[-50%] overflow-hidden rounded-lg border shadow-lg',
					className,
				)}
				{...props}
			>
				{children}
			</DialogPrimitive.Content>
		</DialogPortal>
	)
}

function useCommandPaletteState(): CommandPaletteState {
	return React.useSyncExternalStore(
		subscribe,
		getSnapshot,
		getSnapshot,
	)
}

function pickAppLayoutData(matches: ReturnType<typeof useMatches>) {
	for (const match of matches) {
		const data = match.data as unknown
		if (!data || typeof data !== 'object') continue
		const maybe = data as {
			exercises?: unknown
			playground?: unknown
			extras?: unknown
		}
		if (
			Array.isArray(maybe.exercises) &&
			Array.isArray(maybe.extras) &&
			maybe.playground
		) {
			return maybe as NonNullable<CommandPaletteHost['appLayoutData']>
		}
	}
	return null
}

export function CommandPalette({
	rootData,
}: {
	rootData?: CommandPaletteHost['rootData']
}) {
	const state = useCommandPaletteState()
	const navigate = useNavigate()
	const location = useLocation()
	const matches = useMatches()

	const appLayoutData = React.useMemo(
		() => pickAppLayoutData(matches),
		[matches],
	)
	const host = React.useMemo<CommandPaletteHost>(() => {
		const next: CommandPaletteHost = {
			navigate,
			pathname: location.pathname,
			appLayoutData,
		}
		if (rootData) next.rootData = rootData
		return next
	}, [navigate, location.pathname, appLayoutData, rootData])

	React.useEffect(() => {
		commandPaletteController.setHost(host)
		return () => commandPaletteController.setHost(null)
	}, [host])

	const fallbackView = React.useMemo(
		() =>
			({
				type: 'commands',
				placeholder: 'Type a command…',
				query: '',
				selectedIndex: 0,
			}) as const,
		[],
	)
	const view =
		state.viewStack[state.viewStack.length - 1] ??
		state.viewStack[0] ??
		fallbackView
	const promptKey = 'promptId' in view ? view.promptId : null
	const inputRef = React.useRef<HTMLInputElement>(null)
	const resultsRef = React.useRef<HTMLDivElement>(null)

	React.useEffect(() => {
		if (!state.open) return
		const id = window.setTimeout(() => inputRef.current?.focus(), 0)
		return () => window.clearTimeout(id)
	}, [state.open, view.type, promptKey])

	React.useEffect(() => {
		if (!state.open) return
		if (view.type === 'text' || view.type === 'number') return
		const container = resultsRef.current
		if (!container) return
		const selected = container.querySelector<HTMLElement>(
			`[data-command-palette-entry][data-entry-index="${view.selectedIndex}"]`,
		)
		selected?.scrollIntoView({ block: 'nearest' })
	}, [
		state.open,
		view.type,
		promptKey,
		view.selectedIndex,
		view.query,
		state.entries.length,
	])

	const hint =
		view.type === 'commands'
			? 'Enter to run • Backspace to close • Esc to close'
			: view.type === 'select'
				? 'Enter to select • Backspace to go back • Esc to close'
				: 'Enter to submit • Backspace to go back • Esc to close'

	function handleOpenChange(open: boolean) {
		if (open) {
			commandPaletteController.open()
		} else {
			commandPaletteController.close()
		}
	}

	function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
		if (event.key === 'ArrowDown') {
			event.preventDefault()
			commandPaletteController.moveSelection(1)
			return
		}
		if (event.key === 'ArrowUp') {
			event.preventDefault()
			commandPaletteController.moveSelection(-1)
			return
		}
		if (event.key === 'Escape') {
			event.preventDefault()
			commandPaletteController.close()
			return
		}
		if (event.key === 'Backspace' && view.query.length === 0) {
			event.preventDefault()
			if (state.viewStack.length > 1) {
				commandPaletteController.back()
			} else {
				commandPaletteController.close()
			}
			return
		}
		if (event.key === 'Enter') {
			event.preventDefault()
			if (view.type === 'text' || view.type === 'number') {
				void commandPaletteController.submitCurrentInput()
			} else {
				void commandPaletteController.submitSelected()
			}
		}
	}

	const title =
		view.type === 'commands'
			? 'Command Palette'
			: 'title' in view
				? view.title
				: ''
	const description =
		view.type === 'text' || view.type === 'number'
			? view.description
			: undefined

	// Only render when open to avoid having Radix register global listeners during SSR.
	if (!state.open) return null

	let lastGroup: string | undefined
	return (
		<Dialog open={state.open} onOpenChange={handleOpenChange}>
			<CommandPaletteContent className="p-0">
				<DialogPrimitive.Title className="sr-only">
					{title}
				</DialogPrimitive.Title>
				<DialogPrimitive.Description className="sr-only">
					{description ? `${hint}. ${description}` : hint}
				</DialogPrimitive.Description>
				<div className="border-border border-b px-4 py-3">
					<div className="flex items-center justify-between gap-3">
						<div className="min-w-0">
							<p className="text-foreground truncate text-sm font-medium">
								{title}
							</p>
							<p className="text-muted-foreground truncate text-xs">{hint}</p>
						</div>
						<kbd className="border-border bg-muted text-muted-foreground shrink-0 rounded border px-1.5 py-0.5 font-mono text-[11px]">
							Esc
						</kbd>
					</div>
					<div className="mt-3">
						<input
							ref={inputRef}
							value={view.query}
							onChange={(e) =>
								commandPaletteController.setQuery(e.target.value)
							}
							onKeyDown={handleKeyDown}
							placeholder={view.placeholder}
							autoCapitalize="none"
							autoComplete="off"
							autoCorrect="off"
							spellCheck={false}
							inputMode={view.type === 'number' ? 'numeric' : 'search'}
							className={cn(
								'border-border bg-background text-foreground placeholder:text-muted-foreground w-full rounded-md border px-3 py-2 text-sm outline-none',
								'focus-visible:ring-ring focus-visible:ring-offset-background focus-visible:ring-2 focus-visible:ring-offset-2',
							)}
						/>
						{description ? (
							<p className="text-muted-foreground mt-2 text-xs">
								{description}
							</p>
						) : null}
						{state.errorMessage ? (
							<p className="text-foreground-destructive mt-2 text-xs">
								{state.errorMessage}
							</p>
						) : null}
					</div>
				</div>

				<div ref={resultsRef} className="max-h-[55vh] overflow-y-auto p-1">
					{view.type === 'text' || view.type === 'number' ? (
						<div className="text-muted-foreground px-4 py-6 text-sm">
							Press{' '}
							<kbd className="border-border bg-muted mx-1 rounded border px-1.5 py-0.5 font-mono text-[11px]">
								Enter
							</kbd>{' '}
							to submit.
						</div>
					) : state.entries.length ? (
						<ul className="flex flex-col gap-0.5">
							{state.entries.map((entry, index) => {
								const isSelected = index === view.selectedIndex
								const group = entry.group
								const showGroup = Boolean(group) && group !== lastGroup
								if (group) lastGroup = group

								return (
									<React.Fragment key={entry.id}>
										{showGroup ? (
											<li className="text-muted-foreground px-2 pt-2 pb-1 text-xs font-semibold">
												{group}
											</li>
										) : null}
										<li>
											<button
												type="button"
												data-command-palette-entry
												data-entry-index={index}
												disabled={entry.disabled}
												onMouseMove={() =>
													commandPaletteController.setSelection(index)
												}
												onClick={() => {
													commandPaletteController.setSelection(index)
													void commandPaletteController.submitSelected()
												}}
												className={cn(
													'flex w-full items-start justify-between gap-4 rounded-md px-3 py-2 text-left text-sm transition-colors',
													isSelected ? 'bg-muted' : 'hover:bg-muted/60',
													entry.disabled
														? 'text-muted-foreground cursor-not-allowed opacity-70'
														: 'text-foreground',
												)}
											>
												<span className="min-w-0 flex-1">
													<span className="block truncate font-medium">
														{entry.title}
													</span>
													{entry.subtitle ? (
														<span className="text-muted-foreground block truncate text-xs">
															{entry.subtitle}
														</span>
													) : null}
												</span>
												{entry.shortcut ? (
													<kbd className="border-border bg-muted text-muted-foreground shrink-0 rounded border px-1.5 py-0.5 font-mono text-[11px]">
														{entry.shortcut}
													</kbd>
												) : null}
											</button>
										</li>
									</React.Fragment>
								)
							})}
						</ul>
					) : (
						<div className="text-muted-foreground px-4 py-6 text-sm">
							No results.
						</div>
					)}
				</div>
			</CommandPaletteContent>
		</Dialog>
	)
}
