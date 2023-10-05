import {
	type LinkProps,
	Link,
	useFormAction,
	useNavigation,
} from '@remix-run/react'
import slugify from '@sindresorhus/slugify'
import { clsx, type ClassValue } from 'clsx'
import * as React from 'react'
import { twMerge } from 'tailwind-merge'
import { Icon } from '#app/components/icons.tsx'

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
 * Provide a condition and if that condition is falsey, this throws an error
 * with the given message.
 *
 * inspired by invariant from 'tiny-invariant' except will still include the
 * message in production.
 *
 * @example
 * invariant(typeof value === 'string', `value must be a string`)
 *
 * @param condition The condition to check
 * @param message The message to throw (or a callback to generate the message)
 * @param responseInit Additional response init options if a response is thrown
 *
 * @throws {Error} if condition is falsey
 */
export function invariant(
	condition: any,
	message: string | (() => string),
): asserts condition {
	if (!condition) {
		throw new Error(typeof message === 'function' ? message() : message)
	}
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
 * @param message The message to throw (or a callback to generate the message)
 * @param responseInit Additional response init options if a response is thrown
 *
 * @throws {Response} if condition is falsey
 */
export function invariantResponse(
	condition: any,
	message: string | (() => string),
	responseInit?: ResponseInit,
): asserts condition {
	if (!condition) {
		throw new Response(typeof message === 'function' ? message() : message, {
			status: 400,
			...responseInit,
		})
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

export function ensureUndeployed() {
	if (ENV.KCDSHOP_DEPLOYED) {
		throw new Response('KCDSHOP_DEPLOYED is true, cannot perform this action', {
			status: 400,
		})
	}
}

export function ensureDeployed() {
	if (!ENV.KCDSHOP_DEPLOYED) {
		throw new Response(
			'KCDSHOP_DEPLOYED is false, cannot perform this action',
			{ status: 400 },
		)
	}
}

export function useAltDown() {
	const [altDown, setAltDown] = React.useState(false)

	React.useEffect(() => {
		const set = (e: KeyboardEvent) => setAltDown(e.altKey)
		document.addEventListener('keydown', set)
		document.addEventListener('keyup', set)
		return () => {
			document.removeEventListener('keyup', set)
			document.removeEventListener('keydown', set)
		}
	}, [])
	return altDown
}

export const Heading = React.forwardRef<
	HTMLHeadingElement,
	React.ComponentPropsWithoutRef<'h1'> & {
		as?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
	}
>(function Heading({ id, children, as: asProp, className, ...props }, ref) {
	const Comp = asProp ?? 'h1'
	const slugId = id ?? slugify(children ? String(children) : '')
	return (
		<Comp
			id={slugId || undefined}
			ref={ref}
			className={cn('group relative', className)}
			{...props}
		>
			{slugId ? (
				<Link
					aria-hidden="true"
					tabIndex={-1}
					to={`#${slugId}`}
					className="absolute left-0 top-1/2 -translate-x-full -translate-y-1/2 p-2 opacity-0 transition group-hover:opacity-100 motion-safe:transition"
				>
					<Icon name="Linked" />
				</Link>
			) : null}
			{children}
		</Comp>
	)
})
