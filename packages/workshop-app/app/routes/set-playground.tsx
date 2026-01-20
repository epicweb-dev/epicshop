import {
	getAppByName,
	getApps,
	isPlaygroundApp,
	isProblemApp,
	isSolutionApp,
	setPlayground,
} from '@epic-web/workshop-utils/apps.server'
import { markOnboardingComplete } from '@epic-web/workshop-utils/db.server'
import { getDiffCode } from '@epic-web/workshop-utils/diff.server'
import { clearTestProcessEntry } from '@epic-web/workshop-utils/process-manager.server'
import * as Select from '@radix-ui/react-select'
import { clsx } from 'clsx'
import * as React from 'react'
import { type ActionFunctionArgs, useFetcher } from 'react-router'
import { z } from 'zod'
import { Button } from '#app/components/button.tsx'
import { Icon } from '#app/components/icons.tsx'
import {
	OnboardingBadge,
	useOnboardingIndicator,
} from '#app/components/onboarding-indicator.tsx'
import { showProgressBarField } from '#app/components/progress-bar.tsx'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '#app/components/ui/dialog.tsx'
import { SimpleTooltip } from '#app/components/ui/tooltip.tsx'
import { ensureUndeployed, getErrorMessage } from '#app/utils/misc.tsx'
import { dataWithPE, usePERedirectInput } from '#app/utils/pe.tsx'
import { useRootLoaderData } from '#app/utils/root-loader.ts'
import { createToastHeaders } from '#app/utils/toast.server.ts'

const PLAYGROUND_ONBOARDING_FEATURE_ID = 'set-playground'

const SetPlaygroundSchema = z.object({
	appName: z.string(),
	reset: z
		.string()
		.nullable()
		.optional()
		.transform((v) => v === 'true'),
})

export async function action({ request }: ActionFunctionArgs) {
	ensureUndeployed()
	const formData = await request.formData()
	const rawData = {
		appName: formData.get('appName'),
		redirectTo: formData.get('redirectTo'),
	}
	const result = SetPlaygroundSchema.safeParse(rawData)
	if (!result.success) {
		return dataWithPE(
			request,
			formData,
			{ status: 'error', error: result.error.message } as const,
			{ status: 400 },
		)
	}
	const form = result.data
	const app = await getAppByName(form.appName)
	if (!app) {
		return dataWithPE(
			request,
			formData,
			{ status: 'error', error: `App ${form.appName} not found` } as const,
			{ status: 404 },
		)
	}
	const converseApp =
		isProblemApp(app) && app.solutionName
			? await getAppByName(app.solutionName)
			: isSolutionApp(app) && app.problemName
				? await getAppByName(app.problemName)
				: undefined
	try {
		await setPlayground(app.fullPath, { reset: form.reset })
	} catch (error: unknown) {
		const message = getErrorMessage(error)
		console.error('Error setting playground', message)
		return dataWithPE(
			request,
			formData,
			{ status: 'error', error: message } as const,
			{
				status: 500,
				headers: await createToastHeaders({
					type: 'error',
					title: 'Error',
					description:
						'There was an error setting the playground. Check the terminal for details.',
				}),
			},
		)
	}
	const apps = await getApps({ forceFresh: true })
	const playground = apps.find(isPlaygroundApp)
	if (playground) {
		clearTestProcessEntry(playground)
		if (converseApp) {
			void getDiffCode(playground, converseApp, { forceFresh: true })
		}
	}
	await markOnboardingComplete(PLAYGROUND_ONBOARDING_FEATURE_ID)
	return dataWithPE(request, formData, { status: 'success' } as const)
}

type PersistPlaygroundResult =
	| { status: 'success'; persist: boolean }
	| { status: 'error' }

type SavedPlaygroundsLoaderData =
	| {
			status: 'success'
			savedPlaygrounds: Array<{
				id: string
				appName: string
				createdAt: string
			}>
	  }
	| { status: 'disabled'; savedPlaygrounds: [] }

type SavedPlaygroundsActionData =
	| { status: 'success'; savedPlaygroundId: string }
	| { status: 'error'; error: string }

const savedPlaygroundsValue = '__saved-playgrounds__'
const emptySavedPlaygrounds: Array<{
	id: string
	appName: string
	createdAt: string
}> = []

function usePlaygroundOnboardingGate() {
	const rootData = useRootLoaderData()
	const persistEnabled = rootData.preferences?.playground?.persist ?? false
	const onboardingComplete =
		rootData.preferences?.onboardingComplete?.includes(
			PLAYGROUND_ONBOARDING_FEATURE_ID,
		) ?? false
	return {
		persistEnabled,
		shouldConfirm: !persistEnabled && !onboardingComplete,
	}
}

function PlaygroundSetDialog({
	open,
	onOpenChange,
	onConfirm,
	isSubmitting,
	persistFetcher,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	onConfirm: () => void
	isSubmitting: boolean
	persistFetcher: ReturnType<typeof useFetcher<PersistPlaygroundResult>>
}) {
	const peRedirectInput = usePERedirectInput()
	const { persistEnabled } = usePlaygroundOnboardingGate()
	const isPersisting = persistFetcher.state !== 'idle'
	const currentPersist =
		persistFetcher.data?.status === 'success'
			? persistFetcher.data.persist
			: persistEnabled
	const nextPersist = !currentPersist
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-xl">
				<DialogHeader>
					<DialogTitle>Playground ready for your first step</DialogTitle>
					<DialogDescription>
						Nice work getting here! Setting the playground is how you bring the
						next step&apos;s instructions into your workspace.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-4 text-sm">
					<p className="text-muted-foreground">
						This will replace whatever is currently in your playground with the
						next step&apos;s files. That is expected and the default workflow.
					</p>
					<div className="border-border bg-muted/40 space-y-3 rounded-md border p-4">
						<div>
							<p className="text-foreground font-semibold">
								Optional: Save a copy each time
							</p>
							<p className="text-muted-foreground mt-1 text-sm">
								When enabled, every set saves a copy in
								<span className="font-mono"> saved-playgrounds</span>. You can
								change this later in Preferences.
							</p>
							<p className="text-muted-foreground mt-2 text-xs">
								You can always manage this in Preferences.
							</p>
						</div>
						<persistFetcher.Form method="POST" action="/persist-playground">
							{peRedirectInput}
							<input
								type="hidden"
								name="persist"
								value={nextPersist ? 'true' : 'false'}
							/>
							<div className="flex items-center justify-between gap-3">
								<div>
									<p className="text-foreground text-sm font-medium">
										Persistence
									</p>
									<p className="text-muted-foreground text-xs">
										{currentPersist ? 'Enabled' : 'Disabled'}
									</p>
								</div>
								<button
									type="submit"
									role="switch"
									aria-checked={currentPersist}
									aria-label={`Toggle playground persistence ${
										currentPersist ? 'off' : 'on'
									}`}
									className={clsx(
										'focus-visible:ring-ring relative inline-flex h-6 w-11 items-center rounded-full border transition',
										currentPersist
											? 'border-foreground bg-foreground'
											: 'border-border bg-muted',
										isPersisting ? 'cursor-progress opacity-70' : null,
									)}
									disabled={isPersisting}
								>
									<span
										className={clsx(
											'bg-background inline-block h-5 w-5 rounded-full shadow transition',
											currentPersist ? 'translate-x-5' : 'translate-x-0',
										)}
									/>
								</button>
							</div>
						</persistFetcher.Form>
					</div>
				</div>
				<DialogFooter>
					<button
						type="button"
						className="border-border text-foreground hover:bg-muted focus-visible:ring-ring inline-flex items-center justify-center rounded-md border px-3 py-2 text-sm font-semibold"
						onClick={() => onOpenChange(false)}
					>
						Cancel
					</button>
					<Button
						varient="primary"
						type="button"
						onClick={onConfirm}
						disabled={isSubmitting}
					>
						{isSubmitting ? 'Setting...' : 'Set playground'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

function SavedPlaygroundsDialog({
	open,
	onOpenChange,
	allApps,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	allApps: Array<{ name: string; displayName: string }>
}) {
	const listFetcher = useFetcher<SavedPlaygroundsLoaderData>()
	const actionFetcher = useFetcher<SavedPlaygroundsActionData>()
	const [query, setQuery] = React.useState('')
	const savedPlaygrounds =
		listFetcher.data?.status === 'success'
			? listFetcher.data.savedPlaygrounds
			: emptySavedPlaygrounds
	const isLoading = listFetcher.state !== 'idle' && !listFetcher.data
	const isSubmitting = actionFetcher.state !== 'idle'
	const activeSubmissionId = actionFetcher.formData?.get(
		'savedPlaygroundId',
	) as string | null
	const formatter = React.useMemo(
		() =>
			new Intl.DateTimeFormat(undefined, {
				dateStyle: 'medium',
				timeStyle: 'short',
			}),
		[],
	)

	React.useEffect(() => {
		if (!open) return
		if (listFetcher.state !== 'idle') return
		void listFetcher.load('/saved-playgrounds')
	}, [listFetcher, open])

	React.useEffect(() => {
		if (!open) {
			setQuery('')
		}
	}, [open])

	React.useEffect(() => {
		if (actionFetcher.data?.status === 'success') {
			onOpenChange(false)
		}
	}, [actionFetcher.data, onOpenChange])

	const filteredPlaygrounds = React.useMemo(() => {
		const normalized = query.trim().toLowerCase()
		if (!normalized) return savedPlaygrounds
		return savedPlaygrounds.filter((entry) => {
			const displayName =
				allApps.find((app) => app.name === entry.appName)?.displayName ??
				entry.appName
			return (
				entry.appName.toLowerCase().includes(normalized) ||
				entry.id.toLowerCase().includes(normalized) ||
				displayName.toLowerCase().includes(normalized)
			)
		})
	}, [allApps, query, savedPlaygrounds])

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-2xl">
				<DialogHeader>
					<DialogTitle>Saved playgrounds</DialogTitle>
					<DialogDescription>
						Restore a saved playground into your active playground directory.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-4">
					<div className="space-y-2">
						<label
							htmlFor="savedPlaygroundSearch"
							className="text-sm font-medium"
						>
							Search saved playgrounds
						</label>
						<input
							id="savedPlaygroundSearch"
							type="search"
							value={query}
							onChange={(event) => setQuery(event.currentTarget.value)}
							placeholder="Filter by exercise, app name, or timestamp"
							className="border-border bg-background text-foreground w-full rounded-md border px-3 py-2 text-sm"
						/>
					</div>
					<div className="border-border bg-muted/40 rounded-md border">
						<div className="border-border text-muted-foreground flex items-center justify-between border-b px-3 py-2 text-xs">
							<span>
								{savedPlaygrounds.length === 1
									? '1 saved playground'
									: `${savedPlaygrounds.length} saved playgrounds`}
							</span>
							{query ? (
								<span>
									{filteredPlaygrounds.length === 1
										? '1 match'
										: `${filteredPlaygrounds.length} matches`}
								</span>
							) : null}
						</div>
						<div className="max-h-72 overflow-y-auto">
							{isLoading ? (
								<div className="text-muted-foreground px-3 py-4 text-sm">
									Loading saved playgrounds...
								</div>
							) : listFetcher.data?.status === 'disabled' ? (
								<div className="text-muted-foreground px-3 py-4 text-sm">
									Enable playground persistence in Preferences to use saved
									playgrounds.
								</div>
							) : filteredPlaygrounds.length === 0 ? (
								<div className="text-muted-foreground px-3 py-4 text-sm">
									{query
										? 'No saved playgrounds match your search.'
										: 'No saved playgrounds yet. Set the playground to create one.'}
								</div>
							) : (
								filteredPlaygrounds.map((entry) => {
									const displayName =
										allApps.find((app) => app.name === entry.appName)
											?.displayName ?? entry.appName
									const createdAt = new Date(entry.createdAt)
									const isActive = activeSubmissionId === entry.id
									return (
										<div
											key={entry.id}
											className="border-border flex items-center justify-between gap-4 border-b px-3 py-3 last:border-b-0"
										>
											<div className="min-w-0">
												<p className="text-foreground text-sm font-semibold">
													{displayName}
												</p>
												<p className="text-muted-foreground truncate font-mono text-xs">
													{entry.appName}
												</p>
												<time
													className="text-muted-foreground text-xs"
													dateTime={entry.createdAt}
												>
													{Number.isNaN(createdAt.getTime())
														? entry.createdAt
														: formatter.format(createdAt)}
												</time>
											</div>
											<Button
												varient="primary"
												type="button"
												disabled={isSubmitting}
												onClick={() =>
													actionFetcher.submit(
														{ savedPlaygroundId: entry.id },
														{ method: 'POST', action: '/saved-playgrounds' },
													)
												}
											>
												{isActive ? 'Setting...' : 'Set playground'}
											</Button>
										</div>
									)
								})
							)}
						</div>
					</div>
					{actionFetcher.data?.status === 'error' ? (
						<p className="text-foreground-destructive text-sm">
							{actionFetcher.data.error}
						</p>
					) : null}
				</div>
				<DialogFooter>
					<button
						type="button"
						className="border-border text-foreground hover:bg-muted focus-visible:ring-ring inline-flex items-center justify-center rounded-md border px-3 py-2 text-sm font-semibold"
						onClick={() => onOpenChange(false)}
					>
						Close
					</button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

export function SetPlayground({
	appName,
	reset = false,
	tooltipText,
	...buttonProps
}: {
	appName: string
	tooltipText?: string
	reset?: boolean
} & React.ComponentProps<'button'>) {
	const fetcher = useFetcher<typeof action>()
	const persistFetcher = useFetcher<PersistPlaygroundResult>()
	const peRedirectInput = usePERedirectInput()
	const { shouldConfirm } = usePlaygroundOnboardingGate()
	const [dialogOpen, setDialogOpen] = React.useState(false)
	const formRef = React.useRef<HTMLFormElement>(null)
	const bypassConfirmationRef = React.useRef(false)
	const isSubmitting = fetcher.state !== 'idle'

	const submitButton = (
		<button
			type="submit"
			{...buttonProps}
			className={clsx(
				buttonProps.className,
				fetcher.state !== 'idle' ? 'cursor-progress' : null,
				fetcher.data?.status === 'error' ? 'cursor-not-allowed' : null,
			)}
		/>
	)
	return (
		<>
			<fetcher.Form
				action="/set-playground"
				method="POST"
				className="inline-flex items-center justify-center"
				ref={formRef}
				onSubmit={(event) => {
					if (shouldConfirm && !bypassConfirmationRef.current) {
						event.preventDefault()
						setDialogOpen(true)
						return
					}
					bypassConfirmationRef.current = false
				}}
			>
				{peRedirectInput}
				<input type="hidden" name="appName" value={appName} />
				{reset ? <input type="hidden" name="reset" value="true" /> : null}
				{showProgressBarField}
				{tooltipText ? (
					<SimpleTooltip content={tooltipText}>{submitButton}</SimpleTooltip>
				) : (
					submitButton
				)}
			</fetcher.Form>
			<PlaygroundSetDialog
				open={dialogOpen}
				onOpenChange={setDialogOpen}
				isSubmitting={isSubmitting}
				persistFetcher={persistFetcher}
				onConfirm={() => {
					bypassConfirmationRef.current = true
					setDialogOpen(false)
					formRef.current?.requestSubmit()
				}}
			/>
		</>
	)
}

export function PlaygroundChooser({
	playgroundAppName,
	allApps,
}: {
	playgroundAppName?: string
	allApps: Array<{ name: string; displayName: string }>
}) {
	const fetcher = useFetcher<typeof action>()
	const persistFetcher = useFetcher<PersistPlaygroundResult>()
	const { shouldConfirm, persistEnabled } = usePlaygroundOnboardingGate()
	const [dialogOpen, setDialogOpen] = React.useState(false)
	const [savedDialogOpen, setSavedDialogOpen] = React.useState(false)
	const [pendingAppName, setPendingAppName] = React.useState<string | null>(
		null,
	)
	const isSubmitting = fetcher.state !== 'idle'
	return (
		<>
			<Select.Root
				name="appName"
				value={playgroundAppName}
				onValueChange={(appName) => {
					if (appName === savedPlaygroundsValue) {
						setSavedDialogOpen(true)
						return
					}
					if (shouldConfirm) {
						setPendingAppName(appName)
						setDialogOpen(true)
						return
					}
					void fetcher.submit(
						{ appName },
						{ method: 'POST', action: '/set-playground' },
					)
				}}
			>
				<Select.Trigger
					aria-label="Select app for playground"
					className={clsx(
						'radix-placeholder:text-muted-foreground flex h-full w-full items-center justify-between text-left focus-visible:outline-none',
						fetcher.state !== 'idle' ? 'cursor-progress' : null,
						fetcher.data?.status === 'error' ? 'cursor-not-allowed' : null,
					)}
				>
					<span className="scrollbar-thin scrollbar-thumb-scrollbar w-80 flex-1 truncate">
						<Select.Value
							placeholder="Select current app"
							className="inline-block w-40 truncate"
						/>
					</span>
					<Select.Icon>
						<Icon name="TriangleDownSmall" />
					</Select.Icon>
				</Select.Trigger>
				<Select.Portal>
					<Select.Content
						position="popper"
						align="start"
						className="invert-theme bg-popover text-popover-foreground z-20 max-h-[50vh] lg:max-h-[70vh]"
					>
						<Select.ScrollUpButton className="flex h-5 cursor-default items-center justify-center">
							<Icon name="ChevronUp" />
						</Select.ScrollUpButton>
						<Select.Viewport className="p-3">
							<Select.Group>
								<Select.Label className="px-5 pb-3 font-mono uppercase">
									App
								</Select.Label>
								{allApps
									.filter((app) => app.name !== 'playground')
									.map((app) => {
										return (
											<SelectItem key={app.name} value={app.name}>
												{app.displayName}
											</SelectItem>
										)
									})}
							</Select.Group>
							{persistEnabled ? (
								<>
									<Select.Separator className="bg-border my-2 h-px" />
									<Select.Group>
										<Select.Label className="text-muted-foreground px-5 pb-2 font-mono text-xs uppercase">
											Saved playgrounds
										</Select.Label>
										<SelectItem value={savedPlaygroundsValue}>
											Choose a saved playground...
										</SelectItem>
									</Select.Group>
								</>
							) : null}
						</Select.Viewport>
						<Select.ScrollDownButton className="flex h-5 cursor-default items-center justify-center">
							<Icon name="ChevronDown" />
						</Select.ScrollDownButton>
					</Select.Content>
				</Select.Portal>
			</Select.Root>
			<PlaygroundSetDialog
				open={dialogOpen}
				onOpenChange={(open) => {
					setDialogOpen(open)
					if (!open) {
						setPendingAppName(null)
					}
				}}
				isSubmitting={isSubmitting}
				persistFetcher={persistFetcher}
				onConfirm={() => {
					if (!pendingAppName) return
					setDialogOpen(false)
					void fetcher.submit(
						{ appName: pendingAppName },
						{ method: 'POST', action: '/set-playground' },
					)
					setPendingAppName(null)
				}}
			/>
			<SavedPlaygroundsDialog
				open={savedDialogOpen}
				onOpenChange={setSavedDialogOpen}
				allApps={allApps}
			/>
		</>
	)
}

function SelectItem({
	value,
	children,
}: {
	value: string
	children: React.ReactNode
}) {
	return (
		<Select.Item
			value={value}
			className="radix-disabled:text-muted-foreground radix-highlighted:opacity-100 radix-highlighted:outline-none radix-state-checked:opacity-100 relative flex cursor-pointer items-center rounded px-10 py-2 leading-none opacity-80 select-none"
		>
			<Select.ItemText>{children}</Select.ItemText>
			<Select.ItemIndicator className="absolute left-0 inline-flex w-[25px] items-center justify-center">
				<Icon name="CheckSmall" />
			</Select.ItemIndicator>
		</Select.Item>
	)
}

export function SetAppToPlayground({
	appName,
	isOutdated,
	hideTextOnNarrow,
	showOnboardingIndicator = false,
	onClick,
	className,
	...buttonProps
}: {
	appName: string
	isOutdated?: boolean
	/** When true, hides text at narrow container widths (for use in @container contexts) */
	hideTextOnNarrow?: boolean
	showOnboardingIndicator?: boolean
} & React.ComponentProps<'button'>) {
	const [showBadge, dismissBadge] = useOnboardingIndicator(
		PLAYGROUND_ONBOARDING_FEATURE_ID,
	)
	if (ENV.EPICSHOP_DEPLOYED) return null
	const shouldShowBadge = showOnboardingIndicator && showBadge
	const buttonClassName = clsx(className, shouldShowBadge ? 'relative' : null)
	return (
		<SetPlayground
			appName={appName}
			tooltipText={
				isOutdated
					? 'The app the playground was set to has been updated. Click to update to the latest version.'
					: 'Playground is not set to the right app. Click to set Playground.'
			}
			{...buttonProps}
			className={buttonClassName}
			onClick={(event) => {
				onClick?.(event)
				if (showOnboardingIndicator) {
					dismissBadge()
				}
			}}
		>
			<span className="text-foreground-destructive flex items-center justify-center gap-1 hover:underline">
				<Icon name="Unlinked" className="animate-ping" />{' '}
				<span
					className={
						hideTextOnNarrow
							? 'hidden uppercase @min-[600px]:inline'
							: 'uppercase'
					}
				>
					{isOutdated ? 'Playground Outdated' : 'Set to Playground'}
				</span>
				{shouldShowBadge ? (
					<OnboardingBadge
						tooltip="Set the playground for this step."
						size="sm"
					/>
				) : null}
			</span>
		</SetPlayground>
	)
}
