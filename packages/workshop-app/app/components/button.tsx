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

export function getButtonClassName({ size }: { size: 'md' | 'lg' }) {
	const baseClassName =
		'clip-path-button mr-auto inline-flex min-w-fit max-w-xs border-2 border-black bg-black font-bold text-white outline-none hover:bg-white hover:text-black focus:bg-white focus:text-black'
	// className="clip-path-button mt-8 inline-flex bg-black text-white"
	const mdClassName = 'px-8 py-4'
	const lgClassName = 'px-8 py-4 text-xl'
	const className = clsx(baseClassName, {
		[mdClassName]: size === 'md',
		[lgClassName]: size === 'lg',
	})
	return className
}

export function Button({
	size,
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
				getButtonClassName({ size }),
				'flex justify-center gap-4',
			)}
		>
			<div>{props.children}</div>
			{companion}
		</button>
	)
}

export function ButtonLink({
	size,
	...props
}: Omit<React.ComponentPropsWithoutRef<typeof Link>, 'className'> &
	Parameters<typeof getButtonClassName>[0]) {
	// eslint-disable-next-line jsx-a11y/anchor-has-content
	return <Link {...props} className={getButtonClassName({ size })} />
}
