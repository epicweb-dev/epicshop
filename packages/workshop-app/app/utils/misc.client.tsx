'use client'

import slugify from '@sindresorhus/slugify'
import dayjsLib from 'dayjs'
import relativeTimePlugin from 'dayjs/plugin/relativeTime'
import utcPlugin from 'dayjs/plugin/utc'
import * as React from 'react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
	Link,
	useFormAction,
	useNavigation,
	type LinkProps,
} from 'react-router'
import { useSpinDelay } from 'spin-delay'
import { Icon } from '#app/components/icons.tsx'
import { cn } from './misc.tsx'

const useServerSafeLayoutEffect =
	typeof window === 'undefined' ? () => {} : useLayoutEffect

type AnchorProps = React.DetailedHTMLProps<
	React.AnchorHTMLAttributes<HTMLAnchorElement>,
	HTMLAnchorElement
>

export const AnchorOrLink = function AnchorOrLink({
	ref,
	...props
}: AnchorProps &
	LinkProps & {
		reload?: boolean
	}) {
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
	let shouldUserRegularAnchor = reload || Boolean(download)

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
		shouldUserRegularAnchor = Boolean(to.pathname?.includes(':'))
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
}

function setupDayjs() {
	dayjsLib.extend(utcPlugin)
	dayjsLib.extend(relativeTimePlugin)
	return dayjsLib
}

export function useDayjs() {
	const [dayjs] = useState(() => setupDayjs())
	return dayjs
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

export const Heading = function Heading({
	ref,
	id,
	children,
	as: asProp,
	className,
	...props
}: {
	ref: React.RefObject<HTMLHeadingElement>
	id?: string
	children: React.ReactNode
	as?: React.ElementType
	className?: string
}) {
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
					className="absolute top-1/2 left-0 -translate-x-full -translate-y-1/2 p-2 opacity-0 transition group-hover:opacity-100 motion-safe:transition"
				>
					<Icon name="Linked" />
				</Link>
			) : null}
			{children}
		</Comp>
	)
}

export function useIsPending({
	formAction,
	formMethod = 'POST',
	state = 'non-idle',
}: {
	formAction?: string
	formMethod?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
	state?: 'submitting' | 'loading' | 'non-idle'
} = {}) {
	const contextualFormAction = useFormAction()
	const navigation = useNavigation()
	return useMemo(() => {
		if (formAction && formAction !== contextualFormAction) return false
		if (formMethod && navigation.formMethod !== formMethod) return false
		if (state === 'submitting') return navigation.state === 'submitting'
		if (state === 'loading') return navigation.state === 'loading'
		return navigation.state !== 'idle'
	}, [contextualFormAction, formAction, formMethod, navigation, state])
}

export function useDelayedIsPending({
	formAction,
	formMethod,
	state = 'non-idle',
	delay = 400,
	minDuration = 300,
}: {
	formAction?: string
	formMethod?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
	state?: 'submitting' | 'loading' | 'non-idle'
	delay?: number
	minDuration?: number
} = {}) {
	const isPending = useIsPending({ formAction, formMethod, state })
	return useSpinDelay(isPending, { delay, minDuration })
}

export function useDoubleCheck() {
	const [doubleCheck, setDoubleCheck] = useState(false)

	const getButtonProps = React.useCallback(
		(props: React.ComponentPropsWithoutRef<'button'> = {}) => {
			return {
				...props,
				onBlur: (event: React.FocusEvent<HTMLButtonElement>) => {
					setDoubleCheck(false)
					props.onBlur?.(event)
				},
				onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
					if (doubleCheck) {
						props.onClick?.(event)
					}
					setDoubleCheck(true)
				},
			}
		},
		[doubleCheck],
	)

	return { doubleCheck, getButtonProps }
}

export function useInterval(callback: () => void, delay: number | null) {
	const savedCallback = useRef(callback)

	// Remember the latest callback.
	useServerSafeLayoutEffect(() => {
		savedCallback.current = callback
	}, [callback])

	// Set up the interval.
	useEffect(() => {
		if (delay === null) return
		const id = setInterval(() => savedCallback.current(), delay)
		return () => clearInterval(id)
	}, [delay])
}

export function useDebounce<T>(value: T, delay: number) {
	const [debouncedValue, setDebouncedValue] = useState(value)

	useEffect(() => {
		const handler = setTimeout(() => {
			setDebouncedValue(value)
		}, delay)

		return () => {
			clearTimeout(handler)
		}
	}, [value, delay])

	return debouncedValue
}
