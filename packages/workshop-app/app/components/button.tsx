import { clsx } from 'clsx'
import { Link } from 'react-router'
import { cn } from '#app/utils/misc.tsx'

function PendingState() {
	return <span className="inline-block animate-spin">🌀</span>
}

function SuccessState() {
	return <span>✅</span>
}

function ErrorState() {
	return <span>❌</span>
}

export function getButtonClassName({
	varient,
	clip = true,
}: {
	varient: 'primary' | 'big' | 'mono'
	clip?: boolean
}) {
	const baseClassName =
		'inline-flex bg-foreground text-background outline-none hover:bg-background hover:text-foreground focus:bg-background focus:text-foreground'
	const primaryClassName = 'px-8 py-4 font-bold'
	const bigClassName = 'px-8 py-4 text-xl font-bold'
	const monoClassName = 'px-8 py-4 font-mono text-sm uppercase'
	const className = clsx(baseClassName, {
		'clip-path-button': clip,
		[primaryClassName]: varient === 'primary',
		[bigClassName]: varient === 'big',
		[monoClassName]: varient === 'mono',
	})
	return className
}

export function Button({
	varient,
	status = 'idle',
	...props
}: React.ComponentPropsWithoutRef<'button'> &
	Parameters<typeof getButtonClassName>[0] & {
		status?: 'pending' | 'success' | 'error' | 'idle'
	}) {
	const companion = {
		pending: <PendingState />,
		success: <SuccessState />,
		error: <ErrorState />,
		idle: null,
	}[status]
	return (
		<div className="clip-path-button-outer border-foreground bg-foreground w-fit border-2">
			<button
				{...props}
				className={clsx(
					props.className,
					getButtonClassName({ varient }),
					'flex justify-center gap-4',
				)}
			>
				<div>{props.children}</div>
				{companion}
			</button>
		</div>
	)
}

export function ButtonLink({
	varient,
	...props
}: React.ComponentPropsWithoutRef<typeof Link> &
	Parameters<typeof getButtonClassName>[0]) {
	return (
		<div className="clip-path-button-outer border-foreground bg-foreground w-fit border-2">
			<Link
				{...props}
				className={clsx(props.className, getButtonClassName({ varient }))}
			/>
		</div>
	)
}

export function LinkButton({
	className,
	...props
}: React.ComponentPropsWithoutRef<'button'>) {
	return <button {...props} className={clsx('underline', className)} />
}

export const iconButtonClassName = `inline-flex h-8 w-8 items-center justify-center rounded border focus:outline-none focus:ring-2 focus:ring-ring`
export function IconButton({
	children,
	className = '',
	...props
}: React.ComponentPropsWithoutRef<'button'>) {
	return (
		<button {...props} className={cn(iconButtonClassName, className)}>
			{children}
		</button>
	)
}
