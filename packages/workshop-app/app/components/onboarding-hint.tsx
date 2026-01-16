import { useFetcher } from 'react-router'
import { Icon } from './icons.tsx'

export function OnboardingHint({
	className,
}: {
	className?: string
}) {
	const fetcher = useFetcher()
	const isSubmitting = fetcher.state !== 'idle'

	// Don't show if currently being dismissed
	if (isSubmitting) {
		return null
	}

	return (
		<div
			className={`border-border bg-accent/50 relative flex items-center justify-between gap-3 border-b px-4 py-2 text-sm ${className ?? ''}`}
		>
			<div className="flex items-center gap-2">
				<Icon name="Notify" className="text-primary h-4 w-4 shrink-0" />
				<span className="text-muted-foreground">
					<span className="font-medium text-foreground">New here?</span> If
					you're unfamiliar with how this app works, check out the intro
					instructions on the home page for a quick overview.
				</span>
			</div>
			<fetcher.Form method="post" action="/dismiss-onboarding-hint">
				<button
					type="submit"
					className="text-muted-foreground hover:text-foreground flex shrink-0 items-center gap-1 text-xs transition-colors"
					aria-label="Dismiss hint"
				>
					<Icon name="Close" className="h-3 w-3" />
					<span className="sr-only sm:not-sr-only">Dismiss</span>
				</button>
			</fetcher.Form>
		</div>
	)
}
