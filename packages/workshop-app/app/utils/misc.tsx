import type { LinkProps } from '@remix-run/react'
import { Link } from '@remix-run/react'
import * as React from 'react'

export function typedBoolean<T>(
	value: T,
): value is Exclude<T, false | null | undefined | '' | 0> {
	return Boolean(value)
}

export function getErrorMessage(error: unknown) {
	if (typeof error === 'string') return error
	if (error instanceof Error) return error.message
	return 'Unknown Error'
}

type AnchorProps = React.DetailedHTMLProps<
	React.AnchorHTMLAttributes<HTMLAnchorElement>,
	HTMLAnchorElement
>

export const AnchorOrLink = React.forwardRef<
	HTMLAnchorElement,
	AnchorProps & {
		reload?: boolean
		to?: LinkProps['to']
		prefetch?: LinkProps['prefetch']
	}
>(function AnchorOrLink(props, ref) {
	const {
		to,
		href,
		download,
		reload = false,
		prefetch,
		children,
		...rest
	} = props
	let toUrl = ''
	let shouldUserRegularAnchor = reload || download

	if (!shouldUserRegularAnchor && typeof href === 'string') {
		shouldUserRegularAnchor = href.includes(':') || href.startsWith('#')
	}

	if (!shouldUserRegularAnchor && typeof to === 'string') {
		toUrl = to
		shouldUserRegularAnchor = to.includes(':')
	}

	if (!shouldUserRegularAnchor && typeof to === 'object') {
		toUrl = `${to.pathname ?? ''}${to.hash ? `#${to.hash}` : ''}${
			to.search ? `?${to.search}` : ''
		}`
		shouldUserRegularAnchor = to.pathname?.includes(':')
	}

	if (shouldUserRegularAnchor) {
		return (
			<a {...rest} download={download} href={href ?? toUrl} ref={ref}>
				{children}
			</a>
		)
	} else {
		return (
			<Link prefetch={prefetch} to={to ?? href ?? ''} {...rest} ref={ref}>
				{children}
			</Link>
		)
	}
})
