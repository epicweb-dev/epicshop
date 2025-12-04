import * as React from 'react'
import iconsSvg from '#app/assets/icons.svg'
import { cn } from '#app/utils/misc.tsx'

type Sizes = 12 | 14 | 16 | 20 | 24 | 28 | 32 | 40

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

export type IconName =
	| 'Keyboard'
	| 'Linked'
	| 'Unlinked'
	| 'TriangleAlert'
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
	| 'Video'
	| 'User'
	| 'EpicWeb'
	| 'EpicWebGradient'
	| 'FastForward'
	| 'Discord'
	| 'Chat'
	| 'House'
	| 'WifiNoConnection'
	| 'Copy'

const sizeClassName = {
	font: 'w-[1em] h-[1em]',
	xs: 'w-3 h-3',
	sm: 'w-4 h-4',
	md: 'w-5 h-5',
	lg: 'w-6 h-6',
	xl: 'w-7 h-7',
	'2xl': 'w-8 h-8',
} as const

type Size = keyof typeof sizeClassName

const childrenSizeClassName = {
	font: 'gap-1.5',
	xs: 'gap-1.5',
	sm: 'gap-1.5',
	md: 'gap-2',
	lg: 'gap-2',
	xl: 'gap-3',
	'2xl': 'gap-4',
} satisfies Record<Size, string>

/**
 * Renders an SVG icon. The icon defaults to the size of the font. To make it
 * align vertically with neighboring text, you can pass the text as a child of
 * the icon and it will be automatically aligned.
 * Alternatively, if you're not ok with the icon being to the left of the text,
 * you need to wrap the icon and text in a common parent and set the parent to
 * display "flex" (or "inline-flex") with "items-center" and a reasonable gap.
 */
export function Icon({
	name,
	size = 'font',
	title,
	className,
	children,
	...props
}: React.SVGProps<SVGSVGElement> & {
	name: IconName
	title?: string
	size?: Size
}) {
	if (children) {
		return (
			<span
				className={`inline-flex items-center ${childrenSizeClassName[size]}`}
			>
				<Icon name={name} size={size} className={className} {...props} />
				{children}
			</span>
		)
	}
	return (
		<svg
			{...props}
			className={cn(sizeClassName[size], 'inline self-center', className)}
		>
			{title ? <title>{title}</title> : null}
			<use href={`${iconsSvg}#${name}`} fill="transparent" />
		</svg>
	)
}
