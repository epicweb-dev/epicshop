import { type ExerciseStepApp } from '@epic-web/workshop-utils/apps.server'
import slugify from '@sindresorhus/slugify'
import { clsx, type ClassValue } from 'clsx'
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
import { extendTailwindMerge } from 'tailwind-merge'
import { Icon } from '#app/components/icons.tsx'

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

export function ensureUndeployed() {
	if (ENV.EPICSHOP_DEPLOYED) {
		throw new Response(
			'EPICSHOP_DEPLOYED is true, cannot perform this action. Run this locally instead.',
			{
				status: 400,
			},
		)
	}
}

export function ensureDeployed() {
	if (!ENV.EPICSHOP_DEPLOYED) {
		throw new Response(
			'EPICSHOP_DEPLOYED is false, cannot perform this action. Run deployed version instead.',
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
export function getUserImgSrc(imageId?: string | null) {
	return imageId ? `/resources/user-images/${imageId}` : '/img/user.png'
}

export function getNoteImgSrc(imageId: string) {
	return `/resources/note-images/${imageId}`
}

export function getErrorMessage(
	error: unknown,
	defaultMessage: string = 'Unknown Error',
) {
	if (typeof error === 'string') return error
	if (
		error &&
		typeof error === 'object' &&
		'message' in error &&
		typeof error.message === 'string'
	) {
		return error.message
	}
	return defaultMessage
}

const customTwMerge = extendTailwindMerge({})

export function cn(...inputs: ClassValue[]) {
	return customTwMerge(clsx(inputs))
}

export function getDomainUrl(request: Request) {
	const url = new URL(request.url)
	const host =
		request.headers.get('X-Forwarded-Host') ??
		request.headers.get('host') ??
		url.host

	const protocol = host.includes('localhost') ? 'http:' : url.protocol
	return `${protocol}//${host}`
}

export function getBaseUrl({
	request,
	domain = request ? getDomainUrl(request) : window.location.origin,
	port,
}: {
	port: number
} & (
	| {
			request: Request
			domain?: never
	  }
	| {
			request?: never
			domain: string
	  }
)) {
	const url = new URL(domain)
	url.port = String(port)
	return url.toString()
}

export function getReferrerRoute(request: Request) {
	// spelling errors and whatever makes this annoyingly inconsistent
	// in my own testing, `referer` returned the right value, but 🤷‍♂️
	const referrer =
		request.headers.get('referer') ??
		request.headers.get('referrer') ??
		request.referrer
	const domain = getDomainUrl(request)
	if (referrer.startsWith(domain)) {
		return referrer.slice(domain.length)
	} else {
		return '/'
	}
}

/**
 * Merge multiple headers objects into one (uses set so headers are overridden)
 */
export function mergeHeaders(
	...headers: Array<ResponseInit['headers'] | null | undefined>
) {
	const merged = new Headers()
	for (const header of headers) {
		if (!header) continue
		for (const [key, value] of new Headers(header).entries()) {
			merged.set(key, value)
		}
	}
	return merged
}

/**
 * Combine multiple header objects into one (uses append so headers are not overridden)
 */
export function combineHeaders(
	...headers: Array<ResponseInit['headers'] | null | undefined>
) {
	const combined = new Headers()
	for (const header of headers) {
		if (!header) continue
		for (const [key, value] of new Headers(header).entries()) {
			combined.append(key, value)
		}
	}
	return combined
}

/**
 * Combine multiple response init objects into one (uses combineHeaders)
 */
export function combineResponseInits(
	...responseInits: Array<ResponseInit | null | undefined>
) {
	let combined: ResponseInit = {}
	for (const responseInit of responseInits) {
		combined = {
			...responseInit,
			headers: combineHeaders(combined.headers, responseInit?.headers),
		}
	}
	return combined
}

/**
 * Returns true if the current navigation is submitting the current route's
 * form. Defaults to the current route's form action and method POST.
 *
 * Defaults state to 'non-idle'
 *
 * NOTE: the default formAction will include query params, but the
 * navigation.formAction will not, so don't use the default formAction if you
 * want to know if a form is submitting without specific query params.
 */
export function useIsPending({
	formAction,
	formMethod = 'POST',
	state = 'non-idle',
}: {
	formAction?: string
	formMethod?: 'POST' | 'GET' | 'PUT' | 'PATCH' | 'DELETE'
	state?: 'submitting' | 'loading' | 'non-idle'
} = {}) {
	const contextualFormAction = useFormAction()
	const navigation = useNavigation()
	const isPendingState =
		state === 'non-idle'
			? navigation.state !== 'idle'
			: navigation.state === state
	return (
		isPendingState &&
		navigation.formAction === (formAction ?? contextualFormAction) &&
		navigation.formMethod === formMethod
	)
}

/**
 * This combines useSpinDelay (from https://npm.im/spin-delay) and useIsPending
 * from our own utilities to give you a nice way to show a loading spinner for
 * a minimum amount of time, even if the request finishes right after the delay.
 *
 * This avoids a flash of loading state regardless of how fast or slow the
 * request is.
 */
export function useDelayedIsPending({
	formAction,
	formMethod,
	delay = 400,
	minDuration = 300,
}: Parameters<typeof useIsPending>[0] &
	Parameters<typeof useSpinDelay>[1] = {}) {
	const isPending = useIsPending({ formAction, formMethod })
	const delayedIsPending = useSpinDelay(isPending, {
		delay,
		minDuration,
	})
	return delayedIsPending
}

function callAll<Args extends Array<unknown>>(
	...fns: Array<((...args: Args) => unknown) | undefined>
) {
	return (...args: Args) => fns.forEach((fn) => fn?.(...args))
}

/**
 * Use this hook with a button and it will make it so the first click sets a
 * `doubleCheck` state to true, and the second click will actually trigger the
 * `onClick` handler. This allows you to have a button that can be like a
 * "are you sure?" experience for the user before doing destructive operations.
 */
export function useDoubleCheck() {
	const [doubleCheck, setDoubleCheck] = useState(false)

	function getButtonProps(
		props?: React.ButtonHTMLAttributes<HTMLButtonElement>,
	) {
		const onBlur: React.ButtonHTMLAttributes<HTMLButtonElement>['onBlur'] =
			() => setDoubleCheck(false)

		const onClick: React.ButtonHTMLAttributes<HTMLButtonElement>['onClick'] =
			doubleCheck
				? () => setDoubleCheck(false)
				: (e) => {
						e.preventDefault()
						setDoubleCheck(true)
					}

		const onKeyUp: React.ButtonHTMLAttributes<HTMLButtonElement>['onKeyUp'] = (
			e,
		) => {
			if (e.key === 'Escape') {
				setDoubleCheck(false)
			}
		}

		return {
			...props,
			onBlur: callAll(onBlur, props?.onBlur),
			onClick: callAll(onClick, props?.onClick),
			onKeyUp: callAll(onKeyUp, props?.onKeyUp),
		}
	}

	return { doubleCheck, getButtonProps }
}

export function useInterval(callback: () => void, delay: number | null) {
	const savedCallback = useRef(callback)

	// Remember the latest callback if it changes.
	useServerSafeLayoutEffect(() => {
		savedCallback.current = callback
	}, [callback])

	// Set up the interval.
	useEffect(() => {
		// Don't schedule if no delay is specified.
		// Note: 0 is a valid value for delay.
		if (delay === null) {
			return
		}

		const id = setInterval(() => {
			savedCallback.current()
		}, delay)

		return () => {
			clearInterval(id)
		}
	}, [delay])
}

/**
 * Simple debounce implementation
 */
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

/**
 * Debounce a callback function
 */
export function useDebounce<
	Callback extends (...args: Parameters<Callback>) => ReturnType<Callback>,
>(callback: Callback, delay: number) {
	const callbackRef = useRef(callback)
	useEffect(() => {
		callbackRef.current = callback
	})
	return useMemo(
		() =>
			debounce(
				(...args: Parameters<Callback>) => callbackRef.current(...args),
				delay,
			),
		[delay],
	)
}

export async function downloadFile(url: string, retries: number = 0) {
	const MAX_RETRIES = 3
	try {
		const response = await fetch(url)
		if (!response.ok) {
			throw new Error(`Failed to fetch image with status ${response.status}`)
		}
		const contentType = response.headers.get('content-type') ?? 'image/jpg'
		const blob = Buffer.from(await response.arrayBuffer())
		return { contentType, blob }
	} catch (e) {
		if (retries > MAX_RETRIES) throw e
		return downloadFile(url, retries + 1)
	}
}

export function getExercisePath(exerciseNumber: number, suffix?: 'finished') {
	const exerciseNumberStr = exerciseNumber.toString().padStart(2, '0')
	if (!suffix) return `/exercise/${exerciseNumberStr}`

	return `/exercise/${exerciseNumberStr}/${suffix}`
}

export function getExerciseStepPath(
	exerciseNumber: number,
	stepNumber: number,
	type?: ExerciseStepApp['type'],
) {
	const exerciseNumberStr = exerciseNumber.toString().padStart(2, '0')
	if (!stepNumber) return `/exercise/${exerciseNumberStr}`

	const stepNumberStr = stepNumber.toString().padStart(2, '0')
	if (!type) return `/exercise/${exerciseNumberStr}/${stepNumberStr}`

	return `/exercise/${exerciseNumberStr}/${stepNumberStr}/${type}`
}

export function calculateExpirationTime(metadata: {
	createdTime: number
	ttl?: number | null
}): number | null {
	const { createdTime, ttl } = metadata
	if (ttl === undefined || ttl === null || ttl === Infinity) {
		return null // Never expires
	}
	return createdTime + ttl
}

export function formatTimeRemaining(expirationTime: number): {
	text: string
	isExpired: boolean
	isExpiringSoon: boolean
} {
	const now = Date.now()
	const remaining = expirationTime - now

	if (remaining <= 0) {
		return { text: 'Expired', isExpired: true, isExpiringSoon: false }
	}

	const seconds = Math.floor(remaining / 1000)
	const minutes = Math.floor(seconds / 60)
	const hours = Math.floor(minutes / 60)
	const days = Math.floor(hours / 24)

	let text: string
	let isExpiringSoon: boolean

	if (days > 0) {
		text = `${days}d ${hours % 24}h`
		isExpiringSoon = days < 1.5
	} else if (hours > 0) {
		text = `${hours}h ${minutes % 60}m`
		isExpiringSoon = hours < 2
	} else if (minutes > 0) {
		text = `${minutes}m ${seconds % 60}s`
		isExpiringSoon = minutes < 10
	} else {
		text = `${seconds}s`
		isExpiringSoon = true
	}

	return { text, isExpired: false, isExpiringSoon }
}

export function formatDuration(ms: number): string {
	if (ms < 1000) return `${Math.round(ms)}ms`
	if (ms < 60000) return `${Math.round(ms / 1000)}s`
	if (ms < 3600000) return `${Math.round(ms / 60000)}m`
	if (ms < 86400000) return `${Math.round(ms / 3600000)}h`
	if (ms < 604800000) return `${Math.round(ms / 86400000)}d`
	if (ms < 2629746000) return `${Math.round(ms / 604800000)}w`
	if (ms < 31556952000) return `${Math.round(ms / 2629746000)}mo`
	return `${Math.round(ms / 31556952000)}y`
}

export function formatFileSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
	if (bytes < 1024 * 1024 * 1024) {
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
	}
	return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}
