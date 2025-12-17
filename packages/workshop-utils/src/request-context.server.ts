import './init-env.ts'

import { AsyncLocalStorage } from 'node:async_hooks'
import { remember } from '@epic-web/remember'

export type RequestContextStore = {
	// Add more keys for other per-request caches as needed
	getExercisesPromise?: Promise<any>
	getAppsPromise?: Promise<any>
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
