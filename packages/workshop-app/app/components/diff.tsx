import React, { Suspense, useMemo } from 'react'
import { Await, Form, useLoaderData, useSubmit } from '@remix-run/react'
import { clsx } from 'clsx'
import * as Select from '@radix-ui/react-select'
import { Mdx } from '~/utils/mdx.tsx'
import { type loader } from '~/routes/_app+/_exercises+/$exerciseNumber_.$stepNumber.$type.tsx'
import AccordionComponent from '~/components/accordion.tsx'
import { Icon } from './icons.tsx'
import * as Accordion from '@radix-ui/react-accordion'

export function Diff() {
	const data = useLoaderData<typeof loader>()
	const submit = useSubmit()

	const mdxComponents = useMemo(() => {
		return {
			Accordion: (props: any) => <AccordionComponent {...props} />,
		}
	}, [])

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
					<p className="text-foreground-danger p-6">
						There was an error calculating the diff. Sorry.
					</p>
				}
			>
				{diff => (
					<div className="flex w-full flex-col">
						<div className="border-border h-14 border-b">
							<Form
								onChange={e => submit(e.currentTarget)}
								className="scrollbar-thin scrollbar-thumb-scrollbar flex h-full w-full items-center overflow-x-auto"
							>
								<input type="hidden" name="preview" value="diff" />
								<SelectFileToDiff
									name="app1"
									label="App 1"
									className="border-border border-r"
									allApps={data.allApps}
									defaultValue={diff.app1}
								/>
								<SelectFileToDiff
									name="app2"
									label="App 2"
									allApps={data.allApps}
									defaultValue={diff.app2}
								/>
							</Form>
						</div>
						<div className="scrollbar-thin scrollbar-thumb-scrollbar max-h-[calc(100vh-109px)] overflow-y-auto">
							{diff.diffCode ? (
								<div>
									<Accordion.Root className="w-full" type="multiple">
										<Mdx code={diff.diffCode} components={mdxComponents} />
									</Accordion.Root>
								</div>
							) : (
								<p className="bg-foreground text-background m-5 inline-flex items-center justify-center px-1 py-0.5 font-mono text-sm uppercase">
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
					'radix-placeholder:text-gray-500 flex h-full w-full min-w-[10rem] max-w-[50%] items-center justify-between px-3 text-left focus-visible:outline-none',
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
					className="z-20 max-h-[70vh] bg-black text-white"
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
					'radix-disabled:text-red-500 radix-highlighted:opacity-100  radix-highlighted:outline-none radix-state-checked:opacity-100 relative flex cursor-pointer select-none items-center rounded px-10 py-2 leading-none opacity-80',
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
