import { useEffect, useRef, useState } from 'react'
import { useFetchers, useNavigation } from 'react-router'
import { useSpinDelay } from 'spin-delay'
import { cn } from '#app/utils/misc.tsx'

export const showProgressBarField = (
	<input type="hidden" name="show-progress-bar" value="true" />
)

function EpicProgress() {
	const transition = useNavigation()
	const fetchers = useFetchers().filter(
		(fetcher) => fetcher.formData?.get('show-progress-bar') === 'true',
	)
	const states = [transition.state, ...fetchers.map((f) => f.state)]
	const busy = states.some((s) => s !== 'idle')
	const delayedPending = useSpinDelay(busy, {
		delay: 600,
		minDuration: 400,
	})
	const ref = useRef<HTMLDivElement>(null)
	const [animationComplete, setAnimationComplete] = useState(true)

	const isIdle = states.every((s) => s === 'idle')
	const isSubmitting = states.some((s) => s === 'submitting')
	const isLoading = states.some((s) => s === 'loading')

	useEffect(() => {
		if (!ref.current) return
		if (delayedPending) setAnimationComplete(false)

		const animationPromises = ref.current
			.getAnimations()
			.map(({ finished }) => finished)

		void Promise.allSettled(animationPromises).then(() => {
			if (!delayedPending) setAnimationComplete(true)
		})
	}, [delayedPending])

	return (
		<div
			role="progressbar"
			aria-hidden={delayedPending ? undefined : true}
			aria-valuetext={delayedPending ? 'Loading' : undefined}
			className="fixed inset-x-0 top-0 left-0 z-50 h-[0.20rem] animate-pulse"
		>
			<div
				ref={ref}
				className={cn(
					'bg-highlight h-full w-0 duration-500 ease-in-out',
					isIdle &&
						(animationComplete
							? 'transition-none'
							: 'w-full opacity-0 transition-all'),
					delayedPending && isSubmitting && 'w-5/12',
					delayedPending && isLoading && 'w-8/12',
				)}
			/>
		</div>
	)
}

export { EpicProgress }
