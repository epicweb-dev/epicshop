import * as Accordion from '@radix-ui/react-accordion'
import { clsx } from 'clsx'
import * as React from 'react'
import { Icon } from './icons.tsx'

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
				return (
					<Icon
						name="Modified"
						aria-label="Modified"
						className="text-[#fb923c]"
					/>
				)
			case 'renamed':
				return (
					<Icon
						name="Renamed"
						aria-label="Renamed"
						className="text-[#fb923c]"
					/>
				)
			case 'added':
				return (
					<Icon name="Added" aria-label="Added" className="text-[#10b981]" />
				)
			case 'deleted':
				return (
					<Icon
						name="Deleted"
						aria-label="Deleted"
						className="text-[#ef4444]"
					/>
				)
			default:
				return (
					<Icon
						name="Modified"
						aria-label="Modified"
						className="text-[#fb923c]"
					/>
				)
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
					'prose max-w-none whitespace-pre-wrap dark:prose-invert prose-pre:m-0 prose-pre:mb-1 prose-pre:rounded-none',
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
		<Accordion.Header className="flex" asChild>
			<Accordion.Trigger
				className={clsx(
					'group flex w-full items-center justify-between border-b border-border p-4 pr-3 font-mono text-sm font-medium leading-none hover:bg-foreground/20',
					className,
				)}
				{...props}
				ref={forwardedRef}
			>
				<div className="flex items-center gap-1.5">{children}</div>
				<div className="flex items-center gap-2">
					<span className="font-mono text-xs font-normal uppercase text-muted-foreground">
						{variant}
					</span>
					<Icon
						name="TriangleDownSmall"
						className="transition group-radix-state-open:rotate-180"
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
