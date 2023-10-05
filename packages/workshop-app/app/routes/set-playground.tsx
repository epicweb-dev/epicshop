import * as Select from '@radix-ui/react-select'
import { type DataFunctionArgs, json } from '@remix-run/node'
import { useFetcher } from '@remix-run/react'
import { clsx } from 'clsx'
import { useEffect } from 'react'
import { z } from 'zod'
import { Icon } from '#app/components/icons.tsx'
import { showToast } from '#app/components/toast.tsx'
import {
	getAppByName,
	getApps,
	isPlaygroundApp,
	isProblemApp,
	isSolutionApp,
	setPlayground,
} from '#app/utils/apps.server.ts'
import { getDiffCode } from '#app/utils/diff.server.ts'
import { ensureUndeployed, getErrorMessage } from '#app/utils/misc.tsx'

const setPlaygroundSchema = z.object({
	appName: z.string(),
})

export async function action({ request }: DataFunctionArgs) {
	ensureUndeployed()
	const formData = await request.formData()
	const rawData = {
		appName: formData.get('appName'),
	}
	const result = setPlaygroundSchema.safeParse(rawData)
	if (!result.success) {
		return json({ status: 'error', error: result.error.message } as const, {
			status: 400,
		})
	}
	const form = result.data
	const app = await getAppByName(form.appName)
	if (!app) {
		return json(
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
		await setPlayground(app.fullPath)
	} catch (error: unknown) {
		return json({ status: 'error', error: getErrorMessage(error) } as const, {
			status: 500,
		})
	}
	const apps = await getApps({ forceFresh: true })
	const playground = apps.find(isPlaygroundApp)
	if (playground && converseApp) {
		await getDiffCode(playground, converseApp, { forceFresh: true })
	}
	return json({ status: 'success' } as const)
}

export function SetPlayground({
	appName,
	...buttonProps
}: {
	appName: string
} & JSX.IntrinsicElements['button']) {
	const fetcher = useFetcher<typeof action>()

	useEffect(() => {
		switch (fetcher.state) {
			case 'loading': {
				const error = fetcher.data?.status === 'error' ? fetcher.data.error : ''
				if (error) {
					showToast(document, {
						title: 'Set Playground Error',
						variant: 'Error',
						content: error,
					})
				}
			}
		}
	}, [fetcher])

	return (
		<fetcher.Form
			action="/set-playground"
			method="POST"
			className="inline-flex items-center justify-center"
		>
			<input type="hidden" name="appName" value={appName} />
			<button
				type="submit"
				{...buttonProps}
				className={clsx(
					buttonProps.className,
					fetcher.state !== 'idle' ? 'cursor-progress' : null,
					fetcher.data?.status === 'error' ? 'cursor-not-allowed' : null,
				)}
			/>
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
			onValueChange={appName => {
				fetcher.submit(
					{ appName: appName },
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
					<Select.ScrollUpButton className="flex h-5 cursor-default items-center justify-center ">
						<Icon name="ChevronUp" />
					</Select.ScrollUpButton>
					<Select.Viewport className="p-3">
						<Select.Group>
							<Select.Label className="px-5 pb-3 font-mono uppercase">
								App
							</Select.Label>
							{allApps
								.filter(app => app.name !== 'playground')
								.map(app => {
									return (
										<SelectItem key={app.name} value={app.name}>
											{app.displayName}
										</SelectItem>
									)
								})}
						</Select.Group>
					</Select.Viewport>
					<Select.ScrollDownButton className="flex h-5 cursor-default items-center justify-center ">
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
	if (ENV.KCDSHOP_DEPLOYED) return null
	return (
		<SetPlayground
			appName={appName}
			title="Playground is not set to the right app. Click to set Playground."
		>
			<span className="flex items-center justify-center gap-1 text-foreground-danger hover:underline">
				<Icon name="Unlinked" className="animate-ping" />{' '}
				<span className="uppercase">Set to Playground</span>
			</span>
		</SetPlayground>
	)
}
