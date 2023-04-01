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
	if (
		error &&
		typeof error === 'object' &&
		'message' in error &&
		typeof error.message === 'string'
	) {
		return error.message
	}
	console.error('Unable to get error message for error', error)
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

export type EventDetail = { title?: string; content?: string }

// base on https://usehooks.com/useEventListener/
export function useEventListener(
	eventName: string,
	handler: EventListener,
	element: HTMLElement | Document | (Window & typeof globalThis) | null,
) {
	const savedHandler = React.useRef<typeof handler>()

	React.useEffect(() => {
		savedHandler.current = handler
	}, [handler])

	React.useEffect(() => {
		const isSupported = element && element.addEventListener
		if (!isSupported) return
		const eventListener = function (event: CustomEvent<EventDetail>) {
			if (savedHandler.current) savedHandler.current(event)
		} as EventListener
		element.addEventListener(eventName, eventListener)
		return () => element.removeEventListener(eventName, eventListener)
	}, [eventName, element])
}
