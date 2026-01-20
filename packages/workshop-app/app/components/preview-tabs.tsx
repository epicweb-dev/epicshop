import * as Tabs from '@radix-ui/react-tabs'
import * as React from 'react'
import { Link } from 'react-router'
import { StatusIndicator } from '#app/components/status-indicator.tsx'
import { cn } from '#app/utils/misc.tsx'

export type PreviewTab = {
	id: string
	label: string
	to: string
	hidden?: boolean
	status?: 'running' | 'passed' | 'failed' | null
	onClick?: React.MouseEventHandler<HTMLAnchorElement>
}

export function getPreviewSearchParams(
	searchParams: URLSearchParams,
	previewValue: string,
	defaultValue: string,
) {
	const next = new URLSearchParams(searchParams)
	// Keep URLs clean by omitting the preview param for the default tab.
	if (previewValue === defaultValue) {
		next.delete('preview')
	} else {
		next.set('preview', previewValue)
	}
	return next
}

export function PreviewTabsList({ tabs }: { tabs: PreviewTab[] }) {
	return (
		<Tabs.List className="scrollbar-thin scrollbar-thumb-scrollbar h-14 min-h-14 overflow-x-auto border-b whitespace-nowrap">
			{tabs.map((tab) => (
				<Tabs.Trigger key={tab.id} value={tab.id} hidden={tab.hidden} asChild>
					<Link
						id={`${tab.id}-tab`}
						className={cn(
							'clip-path-button radix-state-active:z-10 radix-state-active:bg-foreground radix-state-active:text-background radix-state-active:hover:bg-foreground/80 radix-state-active:hover:text-background/80 radix-state-inactive:hover:bg-foreground/20 radix-state-inactive:hover:text-foreground/80 focus:bg-foreground/80 focus:text-background/80 relative h-full px-6 py-4 font-mono text-sm uppercase outline-none',
							tab.hidden ? 'hidden' : 'inline-block',
						)}
						preventScrollReset
						prefetch="intent"
						onClick={tab.onClick}
						to={tab.to}
					>
						<span className="flex items-center gap-2">
							{tab.status ? <StatusIndicator status={tab.status} /> : null}
							<span>{tab.label}</span>
						</span>
					</Link>
				</Tabs.Trigger>
			))}
		</Tabs.List>
	)
}
