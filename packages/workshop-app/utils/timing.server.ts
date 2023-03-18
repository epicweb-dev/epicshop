export type Timings = Record<
	string,
	Array<
		{ desc?: string } & (
			| { time: number; start?: never }
			| { time?: never; start: number }
		)
	>
>

export function makeTimings(type: string, desc?: string): Timings {
	return { [type]: [{ desc, start: performance.now() }] }
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
	const start = performance.now()
	const promise = typeof fn === 'function' ? fn() : fn
	if (!timings) return promise
	const result = await promise
	let timingType = timings[type]
	if (!timingType) {
		// eslint-disable-next-line no-multi-assign
		timingType = timings[type] = []
	}

	timingType.push({ desc, time: performance.now() - start })
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
				.map(t => t.desc)
				.filter(Boolean)
				.join(' & ')
			return [
				key.replaceAll(/(:| |@|=|;|,|\/|\\)/g, '_'),
				desc ? `desc=${JSON.stringify(desc)}` : null,
				`dur=${dur}`,
			]
				.filter(Boolean)
				.join(';')
		})
		.join(',')
}

export function combineServerTimings(headers1: Headers, headers2: Headers) {
	const newHeaders = new Headers(headers1)
	newHeaders.append('Server-Timing', headers2.get('Server-Timing') ?? '')
	return newHeaders.get('Server-Timing') ?? ''
}
