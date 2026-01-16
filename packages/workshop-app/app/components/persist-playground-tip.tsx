import { useFetcher, Link } from 'react-router'
import { Icon } from './icons.tsx'

export function PersistPlaygroundTip({
	onDismiss,
}: {
	onDismiss?: () => void
}) {
	const fetcher = useFetcher()
	const isSubmitting = fetcher.state !== 'idle'

	return (
		<div className="bg-accent/50 border-accent relative rounded-lg border p-3">
			<div className="flex items-start gap-3">
				<div className="bg-accent text-accent-foreground flex h-8 w-8 shrink-0 items-center justify-center rounded-full">
					<Icon name="Notify" className="h-4 w-4" />
				</div>
				<div className="min-w-0 flex-1">
					<h4 className="text-foreground text-sm font-semibold">
						Pro Tip: Enable Persist Playground
					</h4>
					<p className="text-muted-foreground mt-1 text-xs leading-relaxed">
						Save your playground work automatically! When enabled, clicking "Set
						to Playground" saves your current progress to a{' '}
						<code className="bg-muted rounded px-1 py-0.5 text-[10px]">
							saved-playgrounds
						</code>{' '}
						directory before resetting.
					</p>
					<div className="mt-2 flex items-center gap-2">
						<Link
							to="/preferences"
							className="text-primary hover:text-primary/80 inline-flex items-center gap-1 text-xs font-medium underline-offset-2 hover:underline"
						>
							Enable in Preferences
							<Icon name="ArrowRight" className="h-3 w-3" />
						</Link>
					</div>
				</div>
				<fetcher.Form method="POST" action="/dismiss-playground-tip">
					<button
						type="submit"
						disabled={isSubmitting}
						onClick={onDismiss}
						className="text-muted-foreground hover:text-foreground hover:bg-muted -mt-1 -mr-1 rounded p-1 transition-colors"
						aria-label="Dismiss tip"
					>
						<Icon name="Close" className="h-4 w-4" />
					</button>
				</fetcher.Form>
			</div>
		</div>
	)
}
