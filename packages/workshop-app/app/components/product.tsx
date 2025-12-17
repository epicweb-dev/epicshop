import { useTheme } from '#app/routes/theme/index.tsx'
import { cn } from '#app/utils/misc.tsx'
import { useWorkshopConfig } from './workshop-config.tsx'

type Sizes = 'font' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl'

const sizeClassName = {
	font: 'w-[1em] h-[1em]',
	xs: 'w-3 h-3',
	sm: 'w-4 h-4',
	md: 'w-5 h-5',
	lg: 'w-6 h-6',
	xl: 'w-7 h-7',
	'2xl': 'w-8 h-8',
} as const

const childrenSizeClassName = {
	font: 'gap-1.5',
	xs: 'gap-1.5',
	sm: 'gap-1.5',
	md: 'gap-2',
	lg: 'gap-2',
	xl: 'gap-3',
	'2xl': 'gap-4',
} satisfies Record<Sizes, string>

export function ProductName(props: React.HTMLAttributes<HTMLSpanElement>) {
	const {
		product: { displayName },
	} = useWorkshopConfig()
	return <span {...props}>{displayName}</span>
}

export function Logo({
	size = 'font',
	style = 'themed',
	className,
	children,
	...props
}: React.SVGProps<SVGSVGElement> & {
	size?: Sizes
	style?: 'themed' | 'monochrome'
	className?: string
	children?: React.ReactNode
}) {
	const {
		product: { logo, displayName },
	} = useWorkshopConfig()
	const theme = useTheme()

	const logoElement = logo.includes('.svg') ? (
		<svg
			{...props}
			className={cn(sizeClassName[size], 'inline self-center', className)}
		>
			<title>{displayName}</title>
			<use href={`${logo}#${style === 'themed' ? theme : 'monochrome'}`} />
		</svg>
	) : (
		// @ts-expect-error - svg props can't all be applied to img... meh, probably won't ever be a real issue...
		<img
			src={logo}
			alt={displayName}
			{...props}
			className={cn(sizeClassName[size], 'inline self-center', className)}
		/>
	)

	if (children) {
		return (
			<span
				className={`inline-flex items-center ${childrenSizeClassName[size]}`}
			>
				{logoElement}
				{children}
			</span>
		)
	}

	return logoElement
}
