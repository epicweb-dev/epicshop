import { useCallback, useEffect, useRef, useState } from 'react'
import { renderToString } from 'react-dom/server'
import * as ToastPrimitive from '@radix-ui/react-toast'
import { AnimatePresence, motion } from 'framer-motion'
import type { DefaultColors } from 'tailwindcss/types/generated/colors'
import clsx from 'clsx'
import { useEventListener, useHydrated } from '~/utils/misc'
import Icon from './icons'

// keys need to match Icon in ./icons, value need to match tailwind color
const colors: Record<ToastVariant, keyof DefaultColors> = {
	action: 'black', // this one don't use an icon
	Error: 'red',
	Notify: 'blue',
	Success: 'green',
}

type ToastProps = Omit<ToastEventProps, 'content'>

function BaseToast({
	title,
	children,
	visible = Boolean(title || children),
	duration = 7000,
	autoClose,
	variant,
	onDismiss,
}: ToastProps) {
	const hiddenAction = variant === 'action' && !visible
	const [open, setOpen] = useState(variant === 'action' || visible)
	const toastRef = useRef<HTMLLIElement>(null)

	const isAction = variant === 'action'
	useEffect(() => {
		setTimeout(() => {
			if (open && toastRef.current) {
				// Toast.Viewport is 'ol' element
				const viewport = toastRef.current.closest('ol')
				window.requestAnimationFrame(() => {
					if (viewport) {
						// in case Toast.Viewport is overflows, we need to wait until the new toast
						// inserted into the DOM before we scroll it to view
						viewport.lastElementChild?.scrollIntoView({
							behavior: 'smooth',
							block: 'end',
						})
						// move Close All Notification button to position
						if (isAction && visible && toastRef.current) {
							viewport.insertBefore(
								toastRef.current as unknown as Node,
								viewport.firstElementChild as unknown as Node,
							)
						}
					}
				})
			}
		}, 0)
	}, [open, isAction, visible])

	const variantColor = variant ? colors[variant] : null
	const ANIMATION_DURATION = 0.3

	return (
		<AnimatePresence>
			{open && !hiddenAction ? (
				<ToastPrimitive.Root
					ref={toastRef}
					asChild
					forceMount
					type="foreground"
					duration={autoClose === false ? Infinity : duration}
					open={true}
					onOpenChange={e => {
						setOpen(e)
						if (!e && onDismiss) {
							setTimeout(
								onDismiss,
								1000 * ANIMATION_DURATION + (isAction ? 300 : 50),
							)
						}
					}}
				>
					<motion.li
						initial={{ y: 150, opacity: 0 }}
						animate={{ y: 0, opacity: 1 }}
						exit={{ y: 150, opacity: 0 }}
						transition={{ ease: 'easeIn', duration: ANIMATION_DURATION }}
						className={clsx(
							"grid grid-cols-[40px_1fr_16px] items-center gap-x-[15px] rounded-md bg-white p-[15px] shadow-[hsl(206_22%_7%_/_35%)_0px_10px_38px_-10px,_hsl(206_22%_7%_/_20%)_0px_10px_20px_-15px] [grid-template-areas:_'icon_title_action'_'icon_description_action']",
							variantColor ? `border-l-8 border-${variantColor}-500` : '',
						)}
					>
						{variant && !isAction && (
							<Icon
								className={clsx(
									'h-10 w-10 ',
									variantColor ? `text-${variantColor}-500` : '',
								)}
								viewBox="0 0 24 24"
								name={variant}
								aria-hidden="true"
							/>
						)}
						<ToastPrimitive.Title
							hidden={isAction}
							className="mb-[5px] text-lg font-bold [grid-area:_title]"
						>
							{title}
						</ToastPrimitive.Title>
						{children && (
							<ToastPrimitive.Description
								className="[grid-area:_description]"
								asChild
							>
								{typeof children === 'string' ? (
									<div>{splitMessageToRows(children)}</div>
								) : (
									children
								)}
							</ToastPrimitive.Description>
						)}
						<ToastPrimitive.Action
							hidden={isAction}
							className="[grid-area:_action]"
							asChild
							altText="Close"
						>
							<button className="self-start">
								<Icon name="Close" aria-label="Close" />
							</button>
						</ToastPrimitive.Action>
					</motion.li>
				</ToastPrimitive.Root>
			) : null}
		</AnimatePresence>
	)
}

// show empty line when the message contain two \n consecutively
function splitMessageToRows(message: string = '') {
	return message
		?.split('\n')
		.map((line, index) =>
			line ? (
				<p key={index}>{line}</p>
			) : (
				<p key={index} className="block h-2"></p>
			),
		)
}

interface Notification extends ToastProps {
	id: number
	hash: string
}

const TOAST_EVENT_NAME: keyof CustomEventMap = 'kcdshop-toast-show'

export function showToast(
	element: EventTargetElement,
	detail: ToastEventProps,
) {
	const event = new CustomEvent(TOAST_EVENT_NAME, { detail })
	element?.dispatchEvent(event)
}

export function NotificationListener() {
	const [notifications, setNotifications] = useState<Notification[]>([])
	const msgId = useRef(0)

	const notification = useCallback((event: CustomEvent<ToastEventProps>) => {
		const { title, variant, children, content, ...props } = event.detail ?? {}
		if (!title || !variant || (!children && !content)) return

		setTimeout(() => {
			const newHash =
				title +
				(children && typeof children !== 'string'
					? renderToString(children)
					: children || content || '')

			setNotifications(prev => [
				// filter out old notification with the same content in order to trigger
				// a new notification animation
				...prev.filter(({ hash }) => hash !== newHash),
				{
					id: msgId.current++,
					hash: newHash,
					title,
					// we allow children or content not both
					children: children || content,
					variant,
					...props,
				},
			])
		}, 0)
	}, [])

	const hydrated = useHydrated()
	useEventListener(TOAST_EVENT_NAME, hydrated ? document : null, notification)

	if (!notifications.length) return null

	return (
		<>
			<BaseToast title="" variant="action" visible={notifications.length > 2}>
				<button
					className="width-max -my-2 justify-self-center rounded-md bg-gray-200 py-1 px-3"
					onClick={() => setNotifications([])}
				>
					Close All Notifications
				</button>
			</BaseToast>
			{notifications.map(({ id: key, ...props }) => (
				<BaseToast
					key={key}
					onDismiss={() =>
						setNotifications(prev => prev.filter(({ id }) => id !== key))
					}
					{...props}
				/>
			))}
		</>
	)
}

// display toast on client
export function Toast(props: ToastEventProps) {
	const [emitted, setEmitted] = useState(false)
	const hydrated = useHydrated()

	if (hydrated && !emitted) {
		setEmitted(true)
		showToast(document, props)
	}

	return null
}

export function ToastHub() {
	return (
		<ToastPrimitive.Provider>
			<NotificationListener />
			<ToastPrimitive.Viewport className="scrollbar-thin scrollbar-thumb-gray-300 min-w-md fixed bottom-0 right-0 z-[2147483647] m-0 flex max-h-full w-[30%] max-w-xl list-none flex-col-reverse gap-[10px] overflow-hidden overflow-y-auto p-[var(--viewport-padding)] outline-none [--viewport-padding:_25px]" />
		</ToastPrimitive.Provider>
	)
}
