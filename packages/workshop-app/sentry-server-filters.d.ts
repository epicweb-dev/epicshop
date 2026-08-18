type ServerSentryEvent = {
	exception?: {
		values?: Array<{
			type?: string
			value?: string
			stacktrace?: {
				frames?: Array<{
					filename?: string
				}>
			}
		}>
	}
}

export function isEsbuildCompileFailureNoise(event: ServerSentryEvent): boolean
export function isPlaygroundServerNoise(event: ServerSentryEvent): boolean
export function isServerEnvironmentNoise(event: ServerSentryEvent): boolean
export function isServerSentryNoise(event: ServerSentryEvent): boolean
