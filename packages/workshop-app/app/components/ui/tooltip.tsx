import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import * as React from 'react'

import { cn } from '#app/utils/misc.tsx'

const TooltipProvider = TooltipPrimitive.Provider

const Tooltip = TooltipPrimitive.Root

const TooltipTrigger = TooltipPrimitive.Trigger

function TooltipContent({
	className,
	sideOffset = 4,
	side = 'top',
	ref,
	...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
	return (
		<TooltipPrimitive.Portal>
			<TooltipPrimitive.Content
				ref={ref}
				side={side}
				sideOffset={sideOffset}
				className={cn(
					'bg-popover text-popover-foreground animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 overflow-hidden rounded-md border px-3 py-1.5 text-sm shadow-md',
					className,
				)}
				{...props}
			/>
		</TooltipPrimitive.Portal>
	)
}
TooltipContent.displayName = TooltipPrimitive.Content.displayName

export const SimpleTooltip = React.forwardRef<
	HTMLElement,
	{
		content: React.ReactNode | null
		children: React.ReactNode
		side?: 'top' | 'bottom' | 'left' | 'right'
	} & React.HTMLAttributes<HTMLElement>
>(({ content, children, side = 'top', ...props }, forwardedRef): React.ReactElement | null => {
	// Merge props onto the child element to support asChild pattern from Radix
	const mergePropsOntoChild = (child: React.ReactNode): React.ReactNode => {
		if (React.isValidElement(child)) {
			const childProps = typeof child.props === 'object' && child.props !== null ? child.props : {}
			return React.cloneElement(child, {
				...props,
				...childProps,
				ref: forwardedRef,
			} as any)
		}
		return child
	}

	if (!content) {
		return mergePropsOntoChild(children) as any
	}
	
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				{mergePropsOntoChild(children)}
			</TooltipTrigger>
			<TooltipContent side={side}>{content}</TooltipContent>
		</Tooltip>
	) as any
})
SimpleTooltip.displayName = 'SimpleTooltip'

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger }
