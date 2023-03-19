import React, { Suspense } from 'react'
import { Await, Form, useLoaderData, useSubmit } from '@remix-run/react'
import clsx from 'clsx'
import * as Select from '@radix-ui/react-select'
import { Mdx } from '~/utils/mdx'
import { type loader } from '~/routes/_app+/$exerciseNumber_.$stepNumber.$type'
import Icon from './icons'
import * as Accordion from '@radix-ui/react-accordion'

type AccordionMDXProps = {
	title: string
	children: React.ReactElement
	variant?: 'changed' | 'added' | 'deleted' | 'renamed'
	icon?: React.ReactElement
	forceMount?: boolean
}

export const AccordionMDX: React.FC<AccordionMDXProps> = ({
	title,
	children,
	variant,
	icon,
	forceMount = false,
}) => {
	const getVariantIcon = () => {
		switch (variant) {
			case 'changed':
				return <Icon name="Modified" aria-label="Modified" />
			case 'renamed':
				return <Icon name="Renamed" aria-label="Renamed" />
			case 'added':
				return <Icon name="Added" aria-label="Added" />
			case 'deleted':
				return <Icon name="Deleted" aria-label="Deleted" />
			default:
				return <Icon name="Modified" aria-label="Modified" />
		}
	}
	const getVariantLabel = () => {
		switch (variant) {
			case 'changed':
				return 'modified'
			default:
				return variant
		}
	}

	return (
		<AccordionItem value={title}>
			<AccordionTrigger variant={getVariantLabel()}>
				{icon ? icon : getVariantIcon()} {title}
			</AccordionTrigger>
			<AccordionContent
				forceMount={forceMount}
				className={clsx(
					'prose prose-pre:rounded-none prose-pre:m-0 prose-pre:mb-1 max-w-none whitespace-pre-wrap',
					{
						'radix-state-closed:hidden': forceMount,
					},
				)}
			>
				{children}
			</AccordionContent>
		</AccordionItem>
	)
}

const AccordionItem: React.FC<any> = React.forwardRef(
	({ children, className, ...props }, forwardedRef) => (
		<Accordion.Item
			className={clsx('', className)}
			{...props}
			ref={forwardedRef}
		>
			{children}
		</Accordion.Item>
	),
)

const AccordionTrigger: React.FC<any> = React.forwardRef(
	({ children, className, variant, ...props }, forwardedRef) => (
		<Accordion.Header className="flex">
			<Accordion.Trigger
				className={clsx(
					'group flex w-full items-center justify-between border-b border-gray-200 p-4 pr-3 font-mono text-sm font-medium leading-none hover:bg-gray-100',
					className,
				)}
				{...props}
				ref={forwardedRef}
			>
				<div className="flex items-center gap-1.5">{children}</div>
				<div className="flex items-center gap-2">
					<span className="font-mono text-xs font-normal uppercase text-gray-500">
						{variant}
					</span>
					<Icon
						name="TriangleDownSmall"
						className="group-radix-state-open:rotate-180 transition"
						aria-hidden
					/>
				</div>
			</Accordion.Trigger>
		</Accordion.Header>
	),
)

const AccordionContent: React.FC<any> = React.forwardRef(
	({ children, className, ...props }, forwardedRef) => (
		<Accordion.Content
			className={clsx('', className)}
			{...props}
			ref={forwardedRef}
		>
			<div>{children}</div>
		</Accordion.Content>
	),
)

export function Diff() {
	const data = useLoaderData<typeof loader>()
	const submit = useSubmit()

	return (
		<Suspense
			fallback={
				<div className="p-8">
					<Icon name="Refresh" className="animate-spin" title="Loading diff" />
				</div>
			}
		>
			<Await
				resolve={data.diff}
				errorElement={
					<p className="p-6 text-rose-700">
						There was an error calculating the diff. Sorry.
					</p>
				}
			>
				{diff => (
					<div className="flex w-full flex-col">
						<div className="h-14 border-b border-gray-200">
							<Form
								onChange={e => submit(e.currentTarget)}
								className="flex h-full w-full items-center overflow-x-auto"
							>
								<input type="hidden" name="preview" value="diff" />
								<SelectFileToDiff
									name="app1"
									label="App 1"
									className="border-r border-gray-200"
									allApps={diff.allApps}
									defaultValue={diff.app1}
								/>
								<SelectFileToDiff
									name="app2"
									label="App 2"
									allApps={diff.allApps}
									defaultValue={diff.app2}
								/>
							</Form>
						</div>
						<div className="max-h-[calc(100vh-109px)] overflow-y-auto">
							{diff.diffCode ? (
								<div>
									<Accordion.Root className="w-full" type="multiple">
										<Mdx code={diff.diffCode} />
									</Accordion.Root>
								</div>
							) : (
								<p className="m-5 inline-flex items-center justify-center bg-black px-1 py-0.5 font-mono text-sm uppercase text-white">
									There was a problem generating the diff
								</p>
							)}
						</div>
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
					'radix-placeholder:text-gray-500 flex h-full w-full items-center justify-between px-3 text-left focus-visible:outline-none',
					className,
				)}
			>
				<span className="w-80 overflow-hidden text-ellipsis whitespace-nowrap">
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
					className="z-20 max-h-[70vh] overflow-hidden bg-black text-white"
				>
					<Select.ScrollUpButton className="flex h-5 cursor-default items-center justify-center ">
						<Icon name="ChevronUp" />
					</Select.ScrollUpButton>
					<Select.Viewport className="p-3">
						<Select.Group>
							<Select.Label className="px-5 pb-3 font-mono uppercase">
								{label}
							</Select.Label>
							{allApps.map(app => {
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

const SelectItem: React.FC<any> = React.forwardRef(
	({ children, className, ...props }, forwardedRef) => {
		return (
			<Select.Item
				className={clsx(
					'radix-disabled:text-red-500 radix-highlighted:opacity-100  radix-highlighted:outline-none radix-state-checked:opacity-100 relative flex cursor-pointer select-none items-center rounded py-2 px-10 leading-none opacity-80',
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
	},
)

const SelectValue: React.FC<any> = React.forwardRef(
	({ children, className, ...props }, forwardedRef) => {
		return (
			<Select.Value {...props} ref={forwardedRef}>
				{props.value}
			</Select.Value>
		)
	},
)
