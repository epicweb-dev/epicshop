import * as React from 'react'
import { useFetcher } from 'react-router'
import { SimpleTooltip } from '#app/components/ui/tooltip.tsx'
import { useRootLoaderData } from '#app/utils/root-loader.ts'

/**
 * Hook to check if user has completed an onboarding feature and provide a function to mark it complete.
 *
 * @param featureId - Unique identifier for the feature (e.g., 'files-popover')
 * @returns Object with `showIndicator` boolean and `markComplete` function
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { showIndicator, markComplete } = useOnboardingIndicator('my-feature')
 *
 *   return (
 *     <button onClick={() => { markComplete(); doSomething(); }}>
 *       Click me
 *       {showIndicator && <OnboardingBadge />}
 *     </button>
 *   )
 * }
 * ```
 */
export function useOnboardingIndicator(featureId: string) {
	const rootData = useRootLoaderData()
	const fetcher = useFetcher()
	const [hasMarkedComplete, setHasMarkedComplete] = React.useState(false)

	const isComplete =
		rootData.preferences?.onboardingComplete?.includes(featureId) ?? false
	const showIndicator = !isComplete && !hasMarkedComplete

	const markComplete = React.useCallback(() => {
		if (!showIndicator) return

		setHasMarkedComplete(true)
		void fetcher.submit(
			{ featureId },
			{
				method: 'POST',
				action: '/mark-onboarding-complete',
			},
		)
	}, [showIndicator, featureId, fetcher])

	return { showIndicator, markComplete }
}

/**
 * A pulsing badge indicator that draws attention to a feature.
 * Typically positioned at the corner of a button or element.
 * Uses a bright yellow/amber color for high visibility in both light and dark modes.
 * Optionally shows a tooltip on hover.
 *
 * @example
 * ```tsx
 * <button className="relative">
 *   Click me
 *   {showIndicator && <OnboardingBadge tooltip="Click to see more!" />}
 * </button>
 * ```
 */
export function OnboardingBadge({
	children = '!',
	tooltip,
	className = '',
}: {
	children?: React.ReactNode
	tooltip?: string
	className?: string
}) {
	const badge = (
		<span
			className={`absolute -top-2 -right-2 flex h-6 w-6 animate-pulse items-center justify-center rounded-full bg-yellow-400 text-sm font-bold text-yellow-950 shadow-lg dark:bg-yellow-500 ${className}`}
		>
			{children}
		</span>
	)

	if (tooltip) {
		return <SimpleTooltip content={tooltip}>{badge}</SimpleTooltip>
	}

	return badge
}

/**
 * A callout message that appears near an element to explain a feature.
 * Typically positioned below the element it's describing.
 * Uses a bright yellow/amber color for high visibility in both light and dark modes.
 *
 * @example
 * ```tsx
 * <div className="relative">
 *   <button>Click me</button>
 *   {showIndicator && (
 *     <OnboardingCallout>
 *       👋 Click here to discover this feature!
 *     </OnboardingCallout>
 *   )}
 * </div>
 * ```
 */
export function OnboardingCallout({
	children,
	className = '',
}: {
	children: React.ReactNode
	className?: string
}) {
	return (
		<div
			className={`absolute top-full left-0 z-20 mt-1 max-w-64 rounded-md bg-yellow-400 px-3 py-2 text-sm text-yellow-950 shadow-lg dark:bg-yellow-500 ${className}`}
		>
			<p className="font-medium">{children}</p>
		</div>
	)
}
