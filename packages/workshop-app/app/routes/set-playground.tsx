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
	const { shouldConfirm } = usePlaygroundOnboardingGate()
	const [dialogOpen, setDialogOpen] = React.useState(false)
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
						'radix-placeholder:text-gray-500 flex h-full w-full items-center justify-between text-left focus-visible:outline-none',
						fetcher.state !== 'idle' ? 'cursor-progress' : null,
						fetcher.data?.status === 'error' ? 'cursor-not-allowed' : null,
					)}
				>
					<span className="scrollbar-thin scrollbar-thumb-scrollbar w-80 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
						<Select.Value
							placeholder="Select current app"
							className="inline-block w-40 text-ellipsis"
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
						className="z-20 max-h-[50vh] bg-black text-white lg:max-h-[70vh]"
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
			className="radix-disabled:text-red-500 radix-highlighted:opacity-100 radix-highlighted:outline-none radix-state-checked:opacity-100 relative flex cursor-pointer items-center rounded px-10 py-2 leading-none opacity-80 select-none"
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
