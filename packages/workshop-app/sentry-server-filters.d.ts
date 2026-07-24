export function isServerEnvironmentNoise(event: {
	exception?: {
		values?: Array<{
			type?: string
			value?: string
		}>
	}
}): boolean
