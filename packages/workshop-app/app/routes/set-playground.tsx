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

type PersistPlaygroundResult = { status: 'success' } | { status: 'error' }

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
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	onConfirm: () => void
	isSubmitting: boolean
}) {
	const persistFetcher = useFetcher<PersistPlaygroundResult>()
	const peRedirectInput = usePERedirectInput()
	const { persistEnabled } = usePlaygroundOnboardingGate()
	const isPersisting = persistFetcher.state !== 'idle'
	const hasPersistEnabled =
		persistEnabled || persistFetcher.data?.status === 'success'
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-xl">
				<DialogHeader>
					<DialogTitle>Set the playground?</DialogTitle>
					<DialogDescription>
						Setting the playground replaces your current playground with the
						next step&apos;s instructions. That is the normal workflow and
						nothing is wrong.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-4 text-sm">
					<p className="text-muted-foreground">
						If you want to keep a copy of your current playground before it is
						replaced, you can enable playground persistence.
					</p>
					<div className="border-border bg-muted/40 space-y-3 rounded-md border p-4">
						<div>
							<p className="text-foreground font-semibold">
								Optional: Save playground copies
							</p>
							<p className="text-muted-foreground mt-1 text-sm">
								When enabled, every set saves a copy in
								<span className="font-mono"> saved-playgrounds</span>. You can
								change this later in Preferences.
							</p>
						</div>
						{hasPersistEnabled ? (
							<p className="text-foreground text-sm font-medium">
								Playground persistence is enabled.
							</p>
						) : (
							<persistFetcher.Form method="POST" action="/persist-playground">
								{peRedirectInput}
								<button
									type="submit"
									className="border-border text-foreground hover:bg-muted focus-visible:ring-ring inline-flex items-center justify-center rounded-md border px-3 py-2 text-sm font-semibold"
									disabled={isPersisting}
								>
									{isPersisting
										? 'Enabling persistence...'
										: 'Enable persistence'}
								</button>
							</persistFetcher.Form>
						)}
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
}: {
	appName: string
	isOutdated?: boolean
	/** When true, hides text at narrow container widths (for use in @container contexts) */
	hideTextOnNarrow?: boolean
}) {
	if (ENV.EPICSHOP_DEPLOYED) return null
	return (
		<SetPlayground
			appName={appName}
			tooltipText={
				isOutdated
					? 'The app the playground was set to has been updated. Click to update to the latest version.'
					: 'Playground is not set to the right app. Click to set Playground.'
			}
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
			</span>
		</SetPlayground>
	)
}
