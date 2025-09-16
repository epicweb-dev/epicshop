import { debuglog } from 'node:util'

type LogFunction = (...args: Parameters<ReturnType<typeof debuglog>>) => void

interface Logger extends LogFunction {
	error: LogFunction
	warn: LogFunction
	info: LogFunction
}

export function logger(ns: string): Logger {
	const log = debuglog(ns)
	
	const loggerFn = ((...args: Parameters<typeof log>) => log(...args)) as Logger
	
	loggerFn.error = (...args: Parameters<typeof log>) => log('🚨', ...args)
	loggerFn.warn = (...args: Parameters<typeof log>) => log('⚠️', ...args)
	loggerFn.info = (...args: Parameters<typeof log>) => log('ℹ️', ...args)
	
	return loggerFn
}

// Convenience function to check if logging is enabled for a namespace
export function isLoggingEnabled(ns: string): boolean {
	return debuglog(ns).enabled
}