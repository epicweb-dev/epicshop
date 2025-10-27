import './init-env.js'

import { AsyncLocalStorage } from 'node:async_hooks'
import { remember } from '@epic-web/remember'

// this is important to make it global so even if somehow we have two versions of the workshop-utils,
// they will share the same request context
export const requestContext = remember(
	'requestContext',
	() => new AsyncLocalStorage<Record<string, unknown>>(),
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

export function resetRequestContext(key: string) {
	const store = requestContext.getStore()
	if (store) delete store[key]
}
