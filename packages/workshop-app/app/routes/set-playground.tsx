import {
	getAppByName,
	getApps,
	isPlaygroundApp,
	isProblemApp,
	isSolutionApp,
	setPlayground,
} from '@epic-web/workshop-utils/apps.server'
import { getDiffCode } from '@epic-web/workshop-utils/diff.server'
import * as Select from '@radix-ui/react-select'
import { clsx } from 'clsx'
import { data, type ActionFunctionArgs, useFetcher } from 'react-router'
import { z } from 'zod'
import { Icon } from '#app/components/icons.tsx'
import { showProgressBarField } from '#app/components/progress-bar.tsx'
import { SimpleTooltip } from '#app/components/ui/tooltip.tsx'
import { ensureUndeployed, getErrorMessage } from '#app/utils/misc.tsx'
import { dataWithPE, usePERedirectInput } from '#app/utils/pe.js'
import { createToastHeaders } from '#app/utils/toast.server.ts'

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
			formData,
			{ status: 'error', error: result.error.message } as const,
			{ status: 400 },
		)
	}
	const form = result.data
	const app = await getAppByName(form.appName)
	if (!app) {
		return dataWithPE(
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
		return data({ status: 'error', error: message } as const, {
			status: 500,
			headers: await createToastHeaders({
				type: 'error',
				title: 'Error',
				description:
					'There was an error setting the playground. Check the terminal for details.',
			}),
		})
	}
	const apps = await getApps({ forceFresh: true })
	const playground = apps.find(isPlaygroundApp)
	if (playground && converseApp) {
		void getDiffCode(playground, converseApp, { forceFresh: true })
	}
	return dataWithPE(formData, { status: 'success' } as const)
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
		<fetcher.Form
			action="/set-playground"
			method="POST"
			className="inline-flex items-center justify-center"
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
	return (
		<Select.Root
			name="appName"
			value={playgroundAppName}
			onValueChange={(appName) => {
				void fetcher.submit(
					{ appName },
					{ method: 'POST', action: '/set-playground' },
				)
			}}
		>
			<Select.Trigger
				aria-label="Select app for playground"
				className={clsx(
					'flex h-full w-full items-center justify-between text-left radix-placeholder:text-gray-500 focus-visible:outline-none',
					fetcher.state !== 'idle' ? 'cursor-progress' : null,
					fetcher.data?.status === 'error' ? 'cursor-not-allowed' : null,
				)}
			>
				<span className="w-80 flex-1 overflow-hidden text-ellipsis whitespace-nowrap scrollbar-thin scrollbar-thumb-scrollbar">
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
			className="relative flex cursor-pointer select-none items-center rounded px-10 py-2 leading-none opacity-80 radix-disabled:text-red-500 radix-highlighted:opacity-100 radix-highlighted:outline-none radix-state-checked:opacity-100"
		>
			<Select.ItemText>{children}</Select.ItemText>
			<Select.ItemIndicator className="absolute left-0 inline-flex w-[25px] items-center justify-center">
				<Icon name="CheckSmall" />
			</Select.ItemIndicator>
		</Select.Item>
	)
}

export function SetAppToPlayground({ appName }: { appName: string }) {
	if (ENV.EPICSHOP_DEPLOYED) return null
	return (
		<SetPlayground
			appName={appName}
			tooltipText="Playground is not set to the right app. Click to set Playground."
		>
			<span className="flex items-center justify-center gap-1 text-foreground-destructive hover:underline">
				<Icon name="Unlinked" className="animate-ping" />{' '}
				<span className="uppercase">Set to Playground</span>
			</span>
		</SetPlayground>
	)
}
