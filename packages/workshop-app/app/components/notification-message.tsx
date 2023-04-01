import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from '@remix-run/react'
import { AnimatePresence, motion } from 'framer-motion'
import clsx from 'clsx'
import Icon from './icons'
import { type EventDetail, useEventListener } from '~/utils/misc'

type Varient = 'alert' | 'default'

export function NotificationMessage({
	queryStringKey,
	visibleMs = 8000,
	visible: controlledVisible,
	autoClose,
	children,
	position = 'bottom-right',
	onDismiss,
	/* how long to wait before the message is shown, after mount 0 to 1 */
	delay = typeof controlledVisible === 'undefined' ? 1 : 0,
	varient = 'default',
}: {
	queryStringKey?: string
	children?: React.ReactNode | React.ReactNode[]
	position?: 'bottom-right' | 'top-center'
	// make the visibility controlled
	visible?: boolean
	delay?: number
	onDismiss?: () => void
	varient?: Varient
} & (
	| { autoClose: false; visibleMs?: never }
	| { visibleMs?: number; autoClose?: never }
)) {
	const [searchParams] = useSearchParams()
	const hasQueryStringValue = queryStringKey
		? searchParams.has(queryStringKey)
		: false
	const [isVisible, setIsVisible] = useState(
		!queryStringKey || hasQueryStringValue,
	)
	const messageFromQuery = queryStringKey && searchParams.get(queryStringKey)
	// Eslint is wrong here, params.get can return an empty string
	// eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
	const message = messageFromQuery || children
	const latestMessageRef = useRef(message)

	// if the query gets a message after the initial mount then we want to toggle visibility
	useEffect(() => {
		if (hasQueryStringValue) setIsVisible(true)
	}, [hasQueryStringValue])

	useEffect(() => {
		latestMessageRef.current = message
	}, [message])

	useEffect(() => {
		if (!latestMessageRef.current) return
		if (autoClose === false) return
		if (controlledVisible === false) return

		const timeout = setTimeout(() => {
			setIsVisible(false)
		}, visibleMs + delay)

		return () => clearTimeout(timeout)
	}, [queryStringKey, delay, autoClose, controlledVisible, visibleMs])

	useEffect(() => {
		if (!latestMessageRef.current) return
		if (queryStringKey && searchParams.has(queryStringKey)) {
			const newSearchParams = new URLSearchParams(searchParams)
			newSearchParams.delete(queryStringKey)

			// use setSearchParams from useSearchParams resulted in redirecting the
			// user to the homepage (wut?) and left a `?` at the end of the URL even
			// if there aren't any other search params. This doesn't have either of
			// those issues.
			window.history.replaceState(
				null,
				'',
				[window.location.pathname, newSearchParams.toString()]
					.filter(Boolean)
					.join('?'),
			)
		}
	}, [queryStringKey, searchParams])

	const initialY = position.includes('bottom') ? 50 : -50
	const show =
		message && typeof controlledVisible === 'boolean'
			? controlledVisible
			: isVisible

	const containerClassName = {
		default:
			'text-inverse px-5vw pointer-events-none fixed left-0 right-0 z-50',
		alert: 'text-inverse px-5vw pointer-events-none fixed left-0 right-2 z-50',
	}
	const outerClassName = {
		default: 'max-w-8xl mx-auto flex w-full',
		alert: 'max-w-8xl ml-auto mr-0 flex w-full',
	}
	const innerClassName = {
		default:
			'bg-inverse text-inverse pointer-events-auto relative max-w-xl rounded-lg p-8 pr-14 shadow-md',
		alert:
			'font-light pointer-events-auto relative max-w-xl rounded-lg border border-red-400 bg-white p-0 pr-8 text-red-700 shadow-md',
	}
	const buttonClassName = {
		default:
			'text-secondary hover:text-inverse focus:text-inverse absolute right-4 top-8',
		alert:
			'hover:text-inverse focus:text-inverse absolute right-4 top-6 text-red-500',
	}

	return (
		<AnimatePresence>
			{show ? (
				<motion.div
					initial={{ y: initialY, opacity: 0 }}
					animate={{ y: 0, opacity: 1, transition: { delay } }}
					exit={{ y: initialY, opacity: 0 }}
					transition={{ ease: 'easeInOut', duration: 0.3 }}
					className={clsx(containerClassName[varient], {
						'bottom-8': position === 'bottom-right',
						'top-8': position === 'top-center',
					})}
				>
					<div
						className={clsx(outerClassName[varient], {
							'justify-end': position === 'bottom-right',
							'justify-center': position === 'top-center',
						})}
					>
						<div className={innerClassName[varient]}>
							{typeof controlledVisible === 'undefined' || onDismiss ? (
								<button
									aria-label="dismiss message"
									onClick={() => {
										setIsVisible(false)
										onDismiss?.()
									}}
									className={buttonClassName[varient]}
								>
									<Icon name="Close" aria-label="Close" />
								</button>
							) : null}
							{message}
						</div>
					</div>
				</motion.div>
			) : null}
		</AnimatePresence>
	)
}

export function AlertNotification() {
	const [hydrated, setHydrated] = useState(false)
	const [message, setMessage] = useState<EventDetail>({})

	const notification = useCallback((event: CustomEvent<EventDetail>) => {
		setTimeout(() => {
			setMessage(event.detail)
		}, 0)
	}, []) as EventListener
	useEventListener('kcdshop-error', notification, hydrated ? document : null)

	useEffect(() => setHydrated(true), [])

	return (
		<NotificationMessage
			varient="alert"
			position="bottom-right"
			visible={!!message.content}
			onDismiss={() => setMessage({})}
		>
			<div className="rounded p-6 pr-0 font-bold">
				<p className="inline-block pb-4 font-bold uppercase">
					{message.title ?? ''}
				</p>
				{
					// show empty line when the message contain two \n consecutively
					message.content
						?.split('\n')
						.map((line, index) =>
							line ? (
								<p key={index}>{line}</p>
							) : (
								<p key={index} className="block h-2"></p>
							),
						)
				}
			</div>
		</NotificationMessage>
	)
}
