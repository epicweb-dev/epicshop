import type { LinkProps } from '@remix-run/react'
import { Link } from '@remix-run/react'
import * as React from 'react'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
const DEFAULT_REDIRECT = '/'

/**
 * This should be used any time the redirect path is user-provided
 * (Like the query string on our login/signup pages). This avoids
 * open-redirect vulnerabilities.
 * @param {string} to The redirect destination
 * @param {string} defaultRedirect The redirect to use if the to is unsafe.
 */
export function safeRedirect(
	to: FormDataEntryValue | string | null | undefined,
	defaultRedirect: string = DEFAULT_REDIRECT,
) {
	if (!to || typeof to !== 'string') {
		return defaultRedirect
	}

	if (!to.startsWith('/') || to.startsWith('//')) {
		return defaultRedirect
	}

	return to
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

/**
 *  base on https://usehooks.com/useEventListener/
 *
 *  make sure to use only memoized handler and options (when it is an object)
 *  to prevents removing and adding the listener on each render
 */
export function useEventListener(
	eventName: keyof CustomEventMap | string,
	element: EventTargetElement,
	handler: CustomEventListener<keyof CustomEventMap>,
	options?: boolean | AddEventListenerOptions,
) {
	const savedHandler = React.useRef<typeof handler>()

	React.useEffect(() => {
		savedHandler.current = handler
	}, [handler])

	React.useEffect(() => {
		const isSupported = element && element.addEventListener
		if (!isSupported) return
		const eventListener: typeof handler = function (event) {
			if (savedHandler.current) savedHandler.current(event)
		}
		element.addEventListener(eventName, eventListener, options)
		return () => element.removeEventListener(eventName, eventListener, options)
	}, [eventName, element, options])
}

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs))
}
