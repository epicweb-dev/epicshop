import { debuglog } from 'node:util'

type LogFunction = (...args: Parameters<ReturnType<typeof debuglog>>) => void

interface Logger extends LogFunction {
	error: LogFunction
	warn: LogFunction
	info: LogFunction
	namespace: string
	logger: typeof logger
	isEnabled: () => boolean
}

export function logger(ns: string): Logger {
	const log = debuglog(ns)

	const loggerFn = ((...args: Parameters<typeof log>) => log(...args)) as Logger

	loggerFn.error = (...args: Parameters<typeof log>) => log('🚨', ...args)
	loggerFn.warn = (...args: Parameters<typeof log>) => log('⚠️', ...args)
	loggerFn.info = (...args: Parameters<typeof log>) => log('ℹ️', ...args)
	loggerFn.namespace = ns
	loggerFn.logger = (subNs: string) => logger(`${ns}:${subNs}`)
	loggerFn.isEnabled = () => debuglog(ns).enabled

	return loggerFn
}
