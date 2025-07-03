import * as Accordion from '@radix-ui/react-accordion'
import * as Select from '@radix-ui/react-select'
import { clsx } from 'clsx'
import React, { Suspense } from 'react'
import {
	Await,
	Form,
	Link,
	useNavigation,
	useSearchParams,
	useSubmit,
} from 'react-router'
import { useSpinDelay } from 'spin-delay'
import AccordionComponent from '#app/components/accordion.tsx'
import { Mdx } from '#app/utils/mdx.tsx'
import { cn } from '#app/utils/misc.tsx'
import { useApps } from './apps.tsx'
import { DeferredEpicVideo } from './epic-video.tsx'
import { Icon } from './icons.tsx'
import { useRevalidationWS } from './revalidation-ws.tsx'
import { SimpleTooltip } from './ui/tooltip.tsx'
import { useUserHasAccess } from './user.tsx'

type diffProp = {
	app1?: string
	app2?: string
	diffCode?: string | null
}

const pre = (props: any) => <pre {...props} />

const mdxComponents = {
	Accordion: AccordionComponent,
	// override the pre-with-buttons
	pre,
}

function RevalidateApps({
	app1: app1Name,
	app2: app2Name,
}: {
	app1?: string
	app2?: string
}) {
	const apps = useApps()
	const app1 = apps.find((app) => app.name === app1Name)
	const app2 = apps.find((app) => app.name === app2Name)

	useRevalidationWS({
		watchPaths: [app1?.fullPath, app2?.fullPath].filter(Boolean),
	})
	return null
}

export function Diff({
	diff,
	allApps,
}: {
	diff: Promise<diffProp> | diffProp
	allApps: Array<{ name: string; displayName: string }>
}) {
	const userHasAccess = useUserHasAccess()
	const submit = useSubmit()
	const [params] = useSearchParams()
	const paramsWithForcedRefresh = new URLSearchParams(params)
	paramsWithForcedRefresh.set('forceFresh', 'diff')
	const navigation = useNavigation()
	const spinnerNavigating = useSpinDelay(navigation.state !== 'idle', {
		delay: 0,
		minDuration: 1000,
	})

	const hiddenInputs: Array<React.ReactNode> = []
	for (const [key, value] of params.entries()) {
		if (key === 'app1' || key === 'app2') continue
		hiddenInputs.push(
			<input key={key} type="hidden" name={key} value={value} />,
		)
	}

	if (!userHasAccess) {
		return (
			<div className="w-full p-12">
				<div className="flex w-full flex-col gap-4 text-center">
					<p className="text-2xl font-bold">Access Denied</p>
					<p className="text-lg">
						You must login or register for the workshop to view the diff.
					</p>
				</div>
				<div className="h-16" />
				<p className="pb-4">
					Check out this video to see how the diff tab works.
				</p>
				<DeferredEpicVideo url="https://www.epicweb.dev/tips/epic-workshop-diff-tab-demo" />
			</div>
		)
	}

	return (
		<Suspense
			fallback={
				<div className="flex items-center justify-center p-8">
					<SimpleTooltip content="Loading diff">
						<Icon name="Refresh" className="animate-spin" />
					</SimpleTooltip>
				</div>
			}
		>
			<Await
				resolve={diff}
				errorElement={
					<p className="p-6 text-foreground-destructive">
						There was an error calculating the diff. Sorry.
					</p>
				}
			>
				{(diff) => (
					<div className="flex h-full w-full flex-col">
						<div className="flex h-14 min-h-14 w-full overflow-x-hidden border-b">
							<div className="border-r">
								<SimpleTooltip content="Reload diff">
									<Link
										to={`.?${paramsWithForcedRefresh}`}
										className="flex h-full w-14 items-center justify-center"
									>
										<Icon
											name="Refresh"
											className={cn({ 'animate-spin': spinnerNavigating })}
										/>
									</Link>
								</SimpleTooltip>
							</div>
							<Form
								onChange={(e) => submit(e.currentTarget)}
								className="flex h-full flex-1 items-center overflow-x-auto scrollbar-thin scrollbar-thumb-scrollbar"
								key={`${diff.app1}${diff.app2}`}
							>
								{hiddenInputs}
								<SelectFileToDiff
									name="app1"
									label="App 1"
									className="border-r"
									allApps={allApps}
									defaultValue={diff.app1}
								/>
								<SelectFileToDiff
									name="app2"
									label="App 2"
									allApps={allApps}
									defaultValue={diff.app2}
								/>
							</Form>
						</div>
						<div className="flex-grow overflow-y-scroll scrollbar-thin scrollbar-thumb-scrollbar">
							{diff.diffCode ? (
								<div>
									<Accordion.Root className="w-full" type="multiple">
										<Mdx code={diff.diffCode} components={mdxComponents} />
									</Accordion.Root>
								</div>
							) : diff.app1 && diff.app2 ? (
								<p className="m-5 inline-flex items-center justify-center bg-foreground px-1 py-0.5 font-mono text-sm uppercase text-background">
									There was a problem generating the diff
								</p>
							) : (
								<p className="m-5 inline-flex items-center justify-center bg-foreground px-1 py-0.5 font-mono text-sm uppercase text-background">
									Select two apps to compare
								</p>
							)}
						</div>
						<RevalidateApps app1={diff.app1} app2={diff.app2} />
					</div>
				)}
			</Await>
		</Suspense>
	)
}

function SelectFileToDiff({
	name,
	label,
	className,
	allApps,
	defaultValue,
}: {
	name: string
	label: string
	className?: string
	allApps: Array<{ name: string; displayName: string }>
	defaultValue?: string
}) {
	return (
		<Select.Root name={name} defaultValue={defaultValue}>
			<Select.Trigger
				className={clsx(
					'flex h-full w-full max-w-[50%] items-center justify-between px-3 text-left radix-placeholder:text-gray-500 focus-visible:outline-none',
					className,
				)}
				aria-label={`Select ${label} for git Diff`}
			>
				<span className="overflow-hidden text-ellipsis whitespace-nowrap">
					{label}:{' '}
					<SelectValue
						placeholder={`Select ${label}`}
						className="inline-block w-40 text-ellipsis"
					/>
				</span>
				<Select.Icon className="">
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
								{label}
							</Select.Label>
							{allApps.map((app) => {
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

const SelectItem: React.FC<any> = ({
	ref: forwardedRef,
	children,
	className,
	...props
}) => {
	return (
		<Select.Item
			className={clsx(
				'relative flex cursor-pointer select-none items-center rounded px-10 py-2 leading-none opacity-80 radix-disabled:text-red-500 radix-highlighted:opacity-100 radix-highlighted:outline-none radix-state-checked:opacity-100',

				className,
			)}
			{...props}
			ref={forwardedRef}
		>
			<Select.ItemText>{children}</Select.ItemText>
			<Select.ItemIndicator className="absolute left-0 inline-flex w-[25px] items-center justify-center">
				<Icon name="CheckSmall" />
			</Select.ItemIndicator>
		</Select.Item>
	)
}

const SelectValue: React.FC<any> = ({
	ref: forwardedRef,
	children,
	className,
	...props
}) => {
	return (
		<Select.Value {...props} ref={forwardedRef}>
			{props.value}
		</Select.Value>
	)
}
