export function StatusIndicator({
	status,
}: {
	status: 'running' | 'passed' | 'failed' | 'stopped'
}) {
	const colors = {
		running: {
			pinger: 'bg-yellow-500/60',
			circle: 'bg-yellow-500',
		},
		passed: {
			circle: 'bg-success',
		},
		failed: {
			circle: 'bg-destructive',
		},
		stopped: {
			circle: 'bg-muted-foreground',
		},
	}[status]
	return (
		<span className="relative flex h-3 w-3">
			{colors.pinger ? (
				<span
					className={`absolute inline-flex h-full w-full animate-ping rounded-full ${colors.pinger} opacity-75`}
				/>
			) : null}
			<span
				className={`relative inline-flex h-3 w-3 rounded-full ${colors.circle}`}
			/>
		</span>
	)
}
