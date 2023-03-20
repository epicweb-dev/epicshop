import React from 'react'
import clsx from 'clsx'
import Icon from './icons'
import * as Accordion from '@radix-ui/react-accordion'

type AccordionProps = {
	title: string
	children: React.ReactElement
	variant?: 'changed' | 'added' | 'deleted' | 'renamed'
	icon?: React.ReactElement
	forceMount?: boolean
}

const AccordionComponent: React.FC<AccordionProps> = ({
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

	// Somehow on windows we get double backslashes in the title
	// so we'll just remove those 🤷‍♂️
	const fixedTitle = title.replace(/\\\\/g, '\\')
	return (
		<AccordionItem value={title}>
			<AccordionTrigger variant={getVariantLabel()}>
				{icon ? icon : getVariantIcon()} {fixedTitle}
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

export default AccordionComponent

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
