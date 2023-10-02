import * as React from 'react'

type Sizes = 16 | 20 | 24 | 28 | 32 | 40

// can't use styles in an external SVG sprite, so animated icons get inlined.
export function AnimatedBars({
	title,
	size = 16,
	...props
}: { title?: string; size?: Sizes } & React.ComponentPropsWithoutRef<'svg'>) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 16 16"
			aria-hidden={!title}
			{...props}
		>
			{title ? <title>{title}</title> : null}
			<g fill="currentColor">
				<g className="nc-loop-dots-16-icon-f">
					<circle cx="3" cy="8" fill="currentColor" r="2" />
					<circle cx="8" cy="8" r="2" />
					<circle cx="13" cy="8" fill="currentColor" r="2" />
				</g>
				<style>{`.nc-loop-dots-16-icon-f{--animation-duration:1s}.nc-loop-dots-16-icon-f *{opacity:.4;transform:scale(.7)}.nc-loop-dots-16-icon-f :nth-child(1),.nc-loop-dots-16-icon-f :nth-child(3){animation:nc-loop-dots-anim-2b var(--animation-duration) infinite linear}.nc-loop-dots-16-icon-f :nth-child(1){transform-origin:3px 8px}.nc-loop-dots-16-icon-f :nth-child(2){animation:nc-loop-dots-anim-1b calc(var(--animation-duration)/2) infinite linear;animation-delay:calc(var(--animation-duration)/4);transform-origin:8px 8px}.nc-loop-dots-16-icon-f :nth-child(3){animation-delay:calc(var(--animation-duration)/2);transform-origin:13px 8px}@keyframes nc-loop-dots-anim-1b{0%,100%{opacity:.4;transform:scale(.7)}50%{opacity:1;transform:scale(1)}}@keyframes nc-loop-dots-anim-2b{0%,100%,66%{opacity:.4;transform:scale(.7)}33%{opacity:1;transform:scale(1)}}`}</style>
			</g>
		</svg>
	)
}

export type IconNames =
	| 'Keyboard'
	| 'Linked'
	| 'Unlinked'
	| 'TriangleSmall'
	| 'ArrowLeft'
	| 'ArrowRight'
	| 'Sun'
	| 'Moon'
	| 'ChevronLeft'
	| 'ChevronRight'
	| 'ChevronDown'
	| 'ChevronUp'
	| 'CheckSmall'
	| 'TriangleDownSmall'
	| 'Question'
	| 'Remove'
	| 'ExternalLink'
	| 'Refresh'
	| 'Files'
	| 'Clear'
	| 'Stop'
	| 'Deleted'
	| 'Modified'
	| 'Added'
	| 'Renamed'
	| 'Close'
	| 'Error'
	| 'Notify'
	| 'Success'
	| 'Sun'
	| 'Moon'
	| 'Laptop'

export function Icon({
	title,
	size = 16,
	name,
	...props
}: {
	title?: string
	size?: Sizes
	name: IconNames
} & React.ComponentPropsWithoutRef<'svg'>) {
	return (
		<svg
			width={size}
			height={size}
			aria-hidden={!title}
			fill="transparent"
			xmlns="http://www.w3.org/2000/svg"
			{...props}
		>
			{title ? <title>{title}</title> : null}
			<use href={`/icons.svg#${name}`} />
		</svg>
	)
}
