export function StatusIndicator({
	status,
}: {
	status: 'running' | 'passed' | 'failed' | 'stopped'
}) {
	const colors = {
		running: {
			pinger: 'bg-green-400',
			circle: 'bg-green-500',
		},
		passed: {
			circle: 'bg-green-500',
		},
		failed: {
			circle: 'bg-red-500',
		},
		stopped: {
			circle: 'bg-gray-500',
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
