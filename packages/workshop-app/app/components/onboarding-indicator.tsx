import * as React from 'react'
import { useFetcher, useFetchers, useLocation } from 'react-router'
import { ServerOnly } from 'remix-utils/server-only'
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from '#app/components/ui/tooltip.tsx'
import { useRootLoaderData } from '#app/utils/root-loader.ts'

const ONBOARDING_ROUTE = '/mark-onboarding-complete'
const PE_REDIRECT_INPUT_NAME = '__PE_redirectTo'

/**
 * Hook to check if user has completed an onboarding feature and provide a function to mark it complete.
 * Uses optimistic updates for instant UI feedback with progressive enhancement support.
 *
 * @param featureId - Unique identifier for the feature (e.g., 'files-popover')
 * @returns Tuple of [showIndicator, markComplete] - boolean and function to mark complete
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const [showBadge, dismissBadge] = useOnboardingIndicator('my-feature')
 *
 *   return (
 *     <button
 *       className="relative"
 *       onClick={() => { dismissBadge(); doSomething(); }}
 *     >
 *       Click me
 *       {showBadge ? <OnboardingBadge tooltip="Try this!" /> : null}
 *     </button>
 *   )
 * }
 * ```
 */
export function useOnboardingIndicator(featureId: string) {
	const rootData = useRootLoaderData()
	const fetchers = useFetchers()
	const fetcher = useFetcher()
	const location = useLocation()

	// Check for optimistic update from any in-flight fetcher
	const optimisticComplete = fetchers.some((f) => {
		const formFeatureId = f.formData?.get('featureId')
		return f.formAction === ONBOARDING_ROUTE && formFeatureId === featureId
	})

	const isComplete =
		rootData.preferences?.onboardingComplete?.includes(featureId) ?? false

	// Show indicator if not complete (from DB) and no optimistic update in progress
	const showIndicator = !isComplete && !optimisticComplete

	const markComplete = React.useCallback(() => {
		if (!showIndicator) return

		void fetcher.submit(
			{
				featureId,
				[PE_REDIRECT_INPUT_NAME]: location.pathname,
			},
			{
				method: 'POST',
				action: ONBOARDING_ROUTE,
			},
		)
	}, [showIndicator, featureId, fetcher, location.pathname])

	return [showIndicator, markComplete] as const
}

/**
 * Form component for marking onboarding features as complete with progressive enhancement.
 * Works without JavaScript by submitting a form and redirecting back.
 *
 * @example
 * ```tsx
 * <OnboardingForm featureId="my-feature">
 *   <button type="submit">Mark as seen</button>
 * </OnboardingForm>
 * ```
 */
export function OnboardingForm({
	featureId,
	children,
	onSubmit,
	className,
}: {
	featureId: string
	children: React.ReactNode
	onSubmit?: () => void
	className?: string
}) {
	const fetcher = useFetcher()
	const location = useLocation()

	return (
		<fetcher.Form
			method="POST"
			action={ONBOARDING_ROUTE}
			className={className}
			onSubmit={onSubmit}
		>
			<input type="hidden" name="featureId" value={featureId} />
			<ServerOnly>
				{() => (
					<input
						type="hidden"
						name={PE_REDIRECT_INPUT_NAME}
						value={location.pathname}
					/>
				)}
			</ServerOnly>
			{children}
		</fetcher.Form>
	)
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
 *   {showBadge ? <OnboardingBadge tooltip="Try this feature!" /> : null}
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
	const badgeClasses = `flex h-6 w-6 animate-pulse items-center justify-center rounded-full bg-yellow-400 text-sm font-bold text-yellow-950 shadow-lg dark:bg-yellow-500`

	if (tooltip) {
		return (
			<Tooltip>
				<TooltipTrigger asChild>
					<span
						className={`absolute -top-2 -right-2 cursor-pointer ${badgeClasses} ${className}`}
						tabIndex={0}
					>
						{children}
					</span>
				</TooltipTrigger>
				<TooltipContent side="top" sideOffset={8} collisionPadding={16}>
					{tooltip}
				</TooltipContent>
			</Tooltip>
		)
	}

	return (
		<span className={`absolute -top-2 -right-2 ${badgeClasses} ${className}`}>
			{children}
		</span>
	)
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
 *   {showBadge ? (
 *     <OnboardingCallout>
 *       👋 Click here to discover this feature!
 *     </OnboardingCallout>
 *   ) : null}
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
