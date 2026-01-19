export const downloadResolutionOptions = [
	{ value: 'best', label: 'Best available' },
	{ value: 'high', label: 'High' },
	{ value: 'medium', label: 'Medium' },
	{ value: 'low', label: 'Low' },
] as const

export type DownloadResolutionOption =
	(typeof downloadResolutionOptions)[number]['value']

export function isDownloadResolutionOption(
	value: FormDataEntryValue | null,
): value is DownloadResolutionOption {
	return (
		typeof value === 'string' &&
		downloadResolutionOptions.some((option) => option.value === value)
	)
}
