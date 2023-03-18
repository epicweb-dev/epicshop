import { Link } from '@remix-run/react'
import clsx from 'clsx'

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
}: {
	varient: 'primary' | 'big' | 'mono'
}) {
	const baseClassName =
		'clip-path-button mr-auto inline-flex min-w-fit max-w-xs border-2 border-black bg-black text-white outline-none hover:bg-white hover:text-black focus:bg-white focus:text-black'
	const primaryClassName = 'px-8 py-4 font-bold'
	const bigClassName = 'px-8 py-4 text-xl font-bold'
	const monoClassName = 'px-8 py-4 font-mono text-sm uppercase'
	const className = clsx(baseClassName, {
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
	)
}

export function ButtonLink({
	varient,
	...props
}: React.ComponentPropsWithoutRef<typeof Link> &
	Parameters<typeof getButtonClassName>[0]) {
	// eslint-disable-next-line jsx-a11y/anchor-has-content
	return (
		<Link
			{...props}
			className={clsx(props.className, getButtonClassName({ varient }))}
		/>
	)
}
