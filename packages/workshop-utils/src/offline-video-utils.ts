export const offlineVideoDownloadResolutions = [
	'best',
	'high',
	'medium',
	'low',
] as const

export type OfflineVideoDownloadResolution =
	(typeof offlineVideoDownloadResolutions)[number]

export const videoDownloadQualityOrder: Record<
	OfflineVideoDownloadResolution,
	Array<string>
> = {
	best: ['source', 'highest', 'high', 'medium', 'low'],
	high: ['high', 'medium', 'low', 'highest', 'source'],
	medium: ['medium', 'low', 'high', 'highest', 'source'],
	low: ['low', 'medium', 'high', 'highest', 'source'],
}

export function getPreferredDownloadSize(
	downloadSizes: Array<{ quality: string; size: number | null }>,
	resolution: OfflineVideoDownloadResolution,
) {
	if (downloadSizes.length === 0) return null
	const sizeByQuality = new Map(
		downloadSizes.map((download) => [
			download.quality.toLowerCase(),
			download.size,
		]),
	)
	const order =
		videoDownloadQualityOrder[resolution] ?? videoDownloadQualityOrder.best
	for (const quality of order) {
		const size = sizeByQuality.get(quality)
		if (typeof size === 'number' && Number.isFinite(size) && size > 0)
			return size
	}
	return (
		downloadSizes.find(
			(download) =>
				typeof download.size === 'number' && Number.isFinite(download.size),
		)?.size ?? null
	)
}
