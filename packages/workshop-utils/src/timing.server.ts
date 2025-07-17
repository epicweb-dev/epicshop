import { type CreateReporter } from '@epic-web/cachified'

// Re-export timing utilities from request-context.server.ts
export {
	type Timings,
	getTimings,
	makeTimings,
	time,
	getServerTimeHeader,
	combineServerTimings,
} from './request-context.server.ts'

// Legacy function for backward compatibility
function createTimer(type: string, desc?: string) {
	const start = performance.now()
	return {
		end(timings: any) {
			let timingType = timings[type]

			if (!timingType) {
				timingType = timings[type] = []
			}
			timingType.push({ desc, time: performance.now() - start })
		},
	}
}

export function cachifiedTimingReporter<Value>(
	timings?: any,
	timingKey?: string,
): undefined | CreateReporter<Value> {
	if (!timings) return

	return ({ key }) => {
		timingKey = timingKey ?? key
		const cacheRetrievalTimer = createTimer(
			`cache:${timingKey}`,
			`${timingKey} cache retrieval`,
		)
		let getFreshValueTimer: ReturnType<typeof createTimer> | undefined
		return (event) => {
			switch (event.name) {
				case 'getFreshValueStart':
					getFreshValueTimer = createTimer(
						`getFreshValue:${timingKey}`,
						`request forced to wait for a fresh ${timingKey} value`,
					)
					break
				case 'getFreshValueSuccess':
					getFreshValueTimer?.end(timings)
					break
				case 'done':
					cacheRetrievalTimer.end(timings)
					break
				default:
					break
			}
		}
	}
}
