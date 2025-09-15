import { debuglog } from 'node:util'

export function logger(ns: string) {
	const log = debuglog(ns)
	return (...args: Array<unknown>) => log(...args)
}

// Convenience function to check if logging is enabled for a namespace
export function isLoggingEnabled(ns: string): boolean {
	return debuglog(ns).enabled
}