import type { LinkProps } from '@remix-run/react'
import { Link, useFormAction, useNavigation } from '@remix-run/react'
import { clsx, type ClassValue } from 'clsx'
import * as React from 'react'
import { twMerge } from 'tailwind-merge'

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

/**
 * Provide a condition and if that condition is falsey, this throws a 400
 * Response with the given message.
 *
 * inspired by invariant from 'tiny-invariant'
 *
 * @example
 * invariantResponse(typeof value === 'string', `value must be a string`)
 *
 * @param condition The condition to check
 * @param message The message to throw
 * @param responseInit Additional response init options if a response is thrown
 *
 * @throws {Response} if condition is falsey
 */
export function invariantResponse(
	condition: any,
	message?: string | (() => string),
	responseInit?: ResponseInit,
): asserts condition {
	if (!condition) {
		throw new Response(
			typeof message === 'function'
				? message()
				: message ||
				  'An invariant failed, please provide a message to explain why.',
			{ status: 400, ...responseInit },
		)
	}
}

/**
 * Returns true if the current navigation is submitting the current route's
 * form. Defaults to the current route's form action and method POST.
 */
export function useIsSubmitting({
	formAction,
	formMethod = 'POST',
}: {
	formAction?: string
	formMethod?: 'POST' | 'GET' | 'PUT' | 'PATCH' | 'DELETE'
} = {}) {
	const contextualFormAction = useFormAction()
	const navigation = useNavigation()
	return (
		navigation.state === 'submitting' &&
		navigation.formAction === (formAction ?? contextualFormAction) &&
		navigation.formMethod === formMethod
	)
}
