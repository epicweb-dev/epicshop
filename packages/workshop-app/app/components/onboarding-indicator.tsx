import * as React from 'react'
import { useFetcher } from 'react-router'
import { useRootLoaderData } from '#app/utils/root-loader.ts'

/**
 * Hook to check if user has seen an onboarding feature and provide a function to mark it as seen.
 *
 * @param featureId - Unique identifier for the feature (e.g., 'files-tooltip')
 * @returns Object with `showIndicator` boolean and `markAsSeen` function
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { showIndicator, markAsSeen } = useOnboardingIndicator('my-feature')
 *
 *   return (
 *     <button onClick={() => { markAsSeen(); doSomething(); }}>
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
	const [hasMarkedAsSeen, setHasMarkedAsSeen] = React.useState(false)

	const hasSeenFeature =
		rootData.preferences?.onboardingSeen?.[featureId] ?? false
	const showIndicator = !hasSeenFeature && !hasMarkedAsSeen

	const markAsSeen = React.useCallback(() => {
		if (!showIndicator) return

		setHasMarkedAsSeen(true)
		void fetcher.submit(
			{ featureId },
			{
				method: 'POST',
				action: '/mark-onboarding-seen',
			},
		)
	}, [showIndicator, featureId, fetcher])

	return { showIndicator, markAsSeen }
}

/**
 * A pulsing badge indicator that draws attention to a feature.
 * Typically positioned at the corner of a button or element.
 *
 * @example
 * ```tsx
 * <button className="relative">
 *   Click me
 *   {showIndicator && <OnboardingBadge />}
 * </button>
 * ```
 */
export function OnboardingBadge({
	children = '!',
	className = '',
}: {
	children?: React.ReactNode
	className?: string
}) {
	return (
		<span
			className={`bg-accent text-accent-foreground absolute -top-1 -right-1 flex h-5 w-5 animate-pulse items-center justify-center rounded-full text-xs font-bold shadow-md ${className}`}
		>
			{children}
		</span>
	)
}

/**
 * A callout message that appears near an element to explain a feature.
 * Typically positioned below the element it's describing.
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
			className={`bg-accent text-accent-foreground absolute top-full left-0 z-20 mt-1 max-w-64 rounded-md px-3 py-2 text-sm shadow-lg ${className}`}
		>
			<p className="font-medium">{children}</p>
		</div>
	)
}
