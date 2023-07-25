import { useCallback, useEffect, useRef, useState } from 'react'
import { renderToString } from 'react-dom/server'
import * as ToastPrimitive from '@radix-ui/react-toast'
import { AnimatePresence, motion } from 'framer-motion'
import { clsx } from 'clsx'
import type { DefaultColors } from 'tailwindcss/types/generated/colors.d.ts'
import { useEventListener } from '~/utils/misc.tsx'
import { Icon } from './icons.tsx'

const ANIMATION_DURATION = 250

// keys need to match Icon in ./icons, value need to match tailwind color
const colors: Record<ToastVariant, keyof DefaultColors> = {
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
	onOpenChange,
}: ToastProps) {
	const [open, setOpen] = useState(visible)

	const variantColor = variant ? colors[variant] : null

	return (
		<AnimatePresence>
			{open ? (
				<ToastPrimitive.Root
					asChild
					forceMount
					type="foreground"
					duration={autoClose === false ? Infinity : duration}
					open={true}
					onOpenChange={e => {
						setOpen(e)
						onOpenChange?.(e)
					}}
				>
					<motion.li
						initial={{ y: 150, opacity: 0 }}
						animate={{ y: 0, opacity: 1 }}
						exit={{ y: 150, opacity: 0 }}
						transition={{ ease: 'easeIn', duration: ANIMATION_DURATION / 1000 }}
						className={clsx(
							"grid grid-cols-[24px_1fr_16px] items-center gap-x-2 gap-y-1 rounded-md p-2 shadow-[hsl(206_22%_7%_/_35%)_0px_10px_38px_-10px,_hsl(206_22%_7%_/_20%)_0px_10px_20px_-15px] [grid-template-areas:_'icon_title_close'_'icon_description_description']",
							{ 'border-l-8 border-red-500': variantColor === 'red' },
							{ 'border-l-8 border-green-500': variantColor === 'green' },
							{ 'border-l-8 border-blue-500': variantColor === 'blue' },
						)}
					>
						{variant && (
							<Icon
								className={clsx(
									'h-6 w-6',
									{ 'text-red-500': variantColor === 'red' },
									{ 'text-green-500': variantColor === 'green' },
									{ 'text-blue-500': variantColor === 'blue' },
								)}
								size={24}
								name={variant}
								aria-hidden="true"
							/>
						)}
						<ToastPrimitive.Title className="font-bold [grid-area:_title]">
							{title}
						</ToastPrimitive.Title>
						{children && (
							<ToastPrimitive.Description
								className="text-sm [grid-area:_description]"
								asChild
							>
								{children}
							</ToastPrimitive.Description>
						)}
						<ToastPrimitive.Close className="place-self-center rounded-full [grid-area:_close] hover:border-2 hover:border-current">
							<Icon name="Close" aria-label="Close" />
						</ToastPrimitive.Close>
					</motion.li>
				</ToastPrimitive.Root>
			) : null}
		</AnimatePresence>
	)
}

// show empty line when the message contain two \n consecutively
function splitMessageToRows(message: string | ToastProps['children'] = '') {
	if (typeof message !== 'string') return message
	const children = message
		?.split('\n')
		.map((line, index) =>
			line ? (
				<p key={index}>{line}</p>
			) : (
				<p key={index} className="block h-2"></p>
			),
		)
	return <div>{children}</div>
}

interface ToastData extends ToastProps {
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

export function ToastHub() {
	const [toasts, setToasts] = useState<ToastData[]>([])
	const updateScroll = useRef(false)
	const viewPortRef = useRef<HTMLOListElement>(null)
	const toastId = useRef(0)

	const handleRemoveToast = useCallback((key: number) => {
		setToasts(prev => prev.filter(({ id }) => id !== key))
	}, [])

	const handleAddToast = useCallback((event: CustomEvent<ToastEventProps>) => {
		const { title, variant, children, content, ...props } = event.detail ?? {}
		if (!title || !variant || (!children && !content)) return
		updateScroll.current = true

		const newHash =
			title +
			(children && typeof children !== 'string'
				? renderToString(children)
				: children || content || '')

		setToasts(prev => [
			// filter out old toast with the same content in order to trigger
			// a new toast animation
			...prev.filter(({ hash }) => hash !== newHash),
			{
				id: ++toastId.current,
				hash: newHash,
				title,
				// we allow children or content not both
				children: splitMessageToRows(children || content),
				variant,
				...props,
			},
		])
	}, [])

	const doc = typeof document === 'undefined' ? null : document
	useEventListener(TOAST_EVENT_NAME, doc, handleAddToast)

	useEffect(() => {
		if (!updateScroll.current) return
		updateScroll.current = false

		// start scrolling while toast animation running to make it appear smoother
		const interval = 50
		const loops = Math.ceil((ANIMATION_DURATION + interval) / interval)
		for (let index = 1; index <= loops; index++) {
			setTimeout(() => {
				viewPortRef.current?.lastElementChild?.scrollIntoView({ block: 'end' })
			}, interval * index)
		}
	}, [toasts.length, updateScroll])

	return (
		<ToastPrimitive.Provider>
			{toasts.length
				? toasts.map(({ id: key, ...props }, index) => (
						<BaseToast
							key={key}
							onOpenChange={open => {
								if (!open) {
									setTimeout(
										() => handleRemoveToast(key),
										ANIMATION_DURATION + 50,
									)
								}
							}}
							{...props}
						/>
				  ))
				: null}
			<ToastPrimitive.Viewport
				ref={viewPortRef}
				className="fixed bottom-0 right-0 z-[2147483647] m-0 flex max-h-full w-[30%] min-w-md max-w-xl list-none flex-col-reverse gap-[10px] overflow-y-auto overflow-x-hidden p-[var(--viewport-padding)] outline-none scrollbar-thin scrollbar-thumb-scrollbar [--viewport-padding:_10px]"
			/>
		</ToastPrimitive.Provider>
	)
}
