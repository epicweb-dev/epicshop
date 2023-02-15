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

type UseLocalStorageOptions<TState = unknown> = {
	serialize?: (data: TState) => string
	deserialize?: (str: string) => TState
}

/**
 *
 * @param {String} key The key to set in localStorage for this value
 * @param {Object} defaultValue The value to use if it is not already in localStorage
 * @param {{serialize: Function, deserialize: Function}} options The serialize and deserialize functions to use (defaults to JSON.stringify and JSON.parse respectively)
 */
export function useLocalStorageState<TState>(
	key: string,
	defaultValue: TState | (() => TState),
	{
		serialize = JSON.stringify,
		deserialize = JSON.parse,
	}: UseLocalStorageOptions<TState> = {},
) {
	const [state, setState] = React.useState(() => {
		if (typeof document !== 'undefined') {
			const valueInLocalStorage = window.localStorage.getItem(key)
			if (valueInLocalStorage) {
				// the try/catch is here in case the localStorage value was set before
				// we had the serialization in place (like we do in previous extra credits)
				try {
					return deserialize(valueInLocalStorage)
				} catch (error) {
					window.localStorage.removeItem(key)
				}
			}
		}

		// can't do typeof because:
		// https://github.com/microsoft/TypeScript/issues/37663#issuecomment-759728342
		return defaultValue instanceof Function ? defaultValue() : defaultValue
	})

	const prevKeyRef = React.useRef(key)

	React.useEffect(() => {
		const prevKey = prevKeyRef.current
		if (prevKey !== key) {
			window.localStorage.removeItem(prevKey)
		}
		prevKeyRef.current = key
		window.localStorage.setItem(key, serialize(state))
	}, [key, state, serialize])

	return [state, setState] as const
}

function debounce<Callback extends (...args: Parameters<Callback>) => void>(
	fn: Callback,
	delay: number,
) {
	let timer: ReturnType<typeof setTimeout> | null = null
	return (...args: Parameters<Callback>) => {
		if (timer) clearTimeout(timer)
		timer = setTimeout(() => {
			fn(...args)
		}, delay)
	}
}

export function useDebounce<
	Callback extends (...args: Parameters<Callback>) => ReturnType<Callback>,
>(callback: Callback, delay: number) {
	const callbackRef = React.useRef(callback)
	React.useEffect(() => {
		callbackRef.current = callback
	})
	return React.useMemo(
		() =>
			debounce(
				(...args: Parameters<Callback>) => callbackRef.current(...args),
				delay,
			),
		[delay],
	)
}
