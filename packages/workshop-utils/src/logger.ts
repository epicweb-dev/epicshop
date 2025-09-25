import { debuglog, type DebugLogger } from 'node:util'

type Msg = string | (() => string)
type Params = unknown[]
type LogFunction = (msg: Msg, ...param: Params) => void

interface Logger extends LogFunction, DebugLogger {
	error: LogFunction
	warn: LogFunction
	info: LogFunction
	namespace: string
	logger: typeof logger
}

export function logger(ns: string): Logger {
	const log = debuglog(ns)

	const prefixedLoggerFn = (
		prefix: string | null,
		stringOrFn: Msg,
		...params: Params
	) => {
		if (!debuglog(ns).enabled) return
		const string = typeof stringOrFn === 'function' ? stringOrFn() : stringOrFn
		log(prefix ? `${prefix} ${string}` : string, ...params)
	}

	const loggerFn = prefixedLoggerFn.bind(null, null) as Logger

	loggerFn.error = prefixedLoggerFn.bind(null, '🚨')
	loggerFn.warn = prefixedLoggerFn.bind(null, '⚠️')
	loggerFn.info = prefixedLoggerFn.bind(null, 'ℹ️')
	loggerFn.namespace = ns
	loggerFn.logger = (subNs: string) => logger(`${ns}:${subNs}`)
	Object.defineProperty(loggerFn, 'enabled', {
		get: () => log.enabled,
	})

	return loggerFn
}
