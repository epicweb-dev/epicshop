import { AsyncLocalStorage } from 'node:async_hooks'
import { remember } from '@epic-web/remember'

export type Timings = Record<
	string,
	Array<
		{ desc?: string } & (
			| { time: number; start?: never }
			| { time?: never; start: number }
		)
	>
>

export type RequestContextStore = {
	// Add more keys for other per-request caches as needed
	getExercisesPromise?: Promise<any>
	getAppsPromise?: Promise<any>
	// New timing and request context
	timings?: Timings
	request?: Request
	requestStartTime?: number
	[key: string]: unknown
}

// this is important to make it global so even if somehow we have two versions of the workshop-utils,
// they will share the same request context
export const requestContext = remember(
	'requestContext',
	() => new AsyncLocalStorage<RequestContextStore>(),
)

export function requestStorageify<T extends (...args: any[]) => Promise<any>>(
	fn: T,
	key?: string,
): T {
	const storageKey = key ?? fn.name
	return function (...args: any[]) {
		const store = requestContext.getStore()
		if (store?.[storageKey]) {
			return store[storageKey]
		}
		const promise = fn(...args)
		if (store) store[storageKey] = promise
		return promise
	} as T
}

// Timing utilities that work with the request context
export function getTimings(): Timings {
	const store = requestContext.getStore()
	if (!store) throw new Error('No request context available')
	
	if (!store.timings) {
		store.timings = {}
		// Add timing for the overall request processing
		const requestStartTime = store.requestStartTime ?? performance.now()
		store.timings['request'] = [{ desc: 'Request processing', start: requestStartTime }]
	}
	
	return store.timings
}

export function makeTimings(type: string, desc?: string): Timings {
	const timings = getTimings()
	timings[type] = [{ desc, start: performance.now() }]
	
	// Add toString method for backward compatibility
	Object.defineProperty(timings, 'toString', {
		value() {
			return getServerTimeHeader(timings)
		},
		enumerable: false,
	})
	
	return timings
}

export function getRequest(): Request {
	const store = requestContext.getStore()
	if (!store?.request) throw new Error('No request available in context')
	return store.request
}

export function setRequestStartTime(startTime: number): void {
	const store = requestContext.getStore()
	if (store) {
		store.requestStartTime = startTime
	}
}

export function initializeRequestContext(request: Request): RequestContextStore {
	const startTime = performance.now()
	return {
		request,
		requestStartTime: startTime,
		timings: {
			request: [{ desc: 'Request processing', start: startTime }]
		}
	}
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
		timings: providedTimings,
	}: {
		type: string
		desc?: string
		timings?: Timings
	},
): Promise<ReturnType> {
	const timer = createTimer(type, desc)
	const promise = typeof fn === 'function' ? fn() : fn
	const timings = providedTimings ?? getTimings()

	const result = await promise
	timer.end(timings)
	return result
}

export function getServerTimeHeader(timings?: Timings): string {
	const actualTimings = timings ?? getTimings()
	if (!actualTimings) return ''
	
	return Object.entries(actualTimings)
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
				key.replaceAll(/(:| |@|=|;|,|\/|\\|\{|\})/g, '_'),
				desc ? `desc=${JSON.stringify(desc)}` : null,
				`dur=${dur}`,
			]
				.filter(Boolean)
				.join(';')
		})
		.join(',')
}

export function combineServerTimings(headers1: Headers, headers2: Headers): string {
	const newHeaders = new Headers(headers1)
	newHeaders.append('Server-Timing', headers2.get('Server-Timing') ?? '')
	return newHeaders.get('Server-Timing') ?? ''
}
