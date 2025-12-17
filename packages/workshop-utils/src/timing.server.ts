import './init-env.ts'

import { type CreateReporter } from '@epic-web/cachified'

export type Timings = Record<
	string,
	Array<
		{ desc?: string } & (
			| { time: number; start?: never }
			| { time?: never; start: number }
		)
	>
>

export function makeTimings(type: string, desc?: string) {
	const timings: Timings = {
		[type]: [{ desc, start: performance.now() }],
	}
	Object.defineProperty(timings, 'toString', {
		value() {
			return getServerTimeHeader(timings)
		},
		enumerable: false,
	})
	return timings
}

function createTimer(type: string, desc?: string) {
	const start = performance.now()
	return {
		end(timings: Timings) {
			let timingType = timings[type]

			if (!timingType) {
				timingType = timings[type] = []
			}
			timingType.push({ desc, time: performance.now() - start })
		},
	}
}

export async function time<ReturnType>(
	fn: Promise<ReturnType> | (() => ReturnType | Promise<ReturnType>),
	{
		type,
		desc,
		timings,
	}: {
		type: string
		desc?: string
		timings?: Timings
	},
): Promise<ReturnType> {
	const timer = createTimer(type, desc)
	const promise = typeof fn === 'function' ? fn() : fn
	if (!timings) return promise

	const result = await promise

	timer.end(timings)
	return result
}

export function getServerTimeHeader(timings?: Timings) {
	if (!timings) return ''
	return Object.entries(timings)
		.map(([key, timingInfos]) => {
			const dur = timingInfos
				.reduce((acc, timingInfo) => {
					const time = timingInfo.time ?? performance.now() - timingInfo.start
					return acc + time
				}, 0)
				.toFixed(1)
			const desc = timingInfos
				.map((t) => t.desc)
				.filter(Boolean)
				.join(' & ')
			return [
				sanitizeHeaderValue(key).replaceAll(/(:| |@|=|;|,|\/|\\|\{|\})/g, '_'),
				desc ? `desc=${sanitizeHeaderValue(desc)}` : null,
				`dur=${dur}`,
			]
				.filter(Boolean)
				.join(';')
		})
		.join(',')
}

function sanitizeHeaderValue(value: string): string {
	// Replace non-ASCII characters with ASCII equivalents
	// This ensures HTTP header compliance
	return value
		.replace(/['']/g, "'") // Replace smart quotes with regular apostrophe
		.replace(/[""]/g, '"') // Replace smart quotes with regular quotes
		.replace(/[–—]/g, '-') // Replace em/en dashes with hyphen
		.replace(/[…]/g, '...') // Replace ellipsis with three dots
		.replace(/[^\x20-\x7E]/g, '') // Remove any remaining non-printable ASCII characters
}

export function combineServerTimings(headers1: Headers, headers2: Headers) {
	const newHeaders = new Headers(headers1)
	newHeaders.append('Server-Timing', headers2.get('Server-Timing') ?? '')
	return newHeaders.get('Server-Timing') ?? ''
}

export function cachifiedTimingReporter<Value>(
	timings?: Timings,
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
