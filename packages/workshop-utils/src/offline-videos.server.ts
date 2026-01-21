import { createHash, randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { createReadStream, createWriteStream, promises as fs } from 'node:fs'
import path from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import {
	getApps,
	getExercises,
	getWorkshopFinished,
	getWorkshopInstructions,
} from './apps.server.ts'
import { getWorkshopConfig } from './config.server.ts'
import { resolvePrimaryDir } from './data-storage.server.ts'
import { getAuthInfo, getClientId, getPreferences } from './db.server.ts'
import {
	type EpicVideoMetadata,
	getEpicVideoInfos,
	getEpicVideoMetadata,
	normalizeVideoApiHost,
} from './epic-api.server.ts'
import { getEnv } from './init-env.ts'
import { logger } from './logger.ts'
import {
	OFFLINE_VIDEO_CRYPTO_VERSION,
	createOfflineVideoCipher,
	createOfflineVideoDecipher,
	createOfflineVideoIv,
	createOfflineVideoSalt,
	decodeOfflineVideoIv,
	deriveOfflineVideoKey,
	encodeOfflineVideoIv,
	getCryptoRange,
	incrementIv,
} from './offline-video-crypto.server.ts'
import {
	type OfflineVideoDownloadResolution,
	getPreferredDownloadSize,
	offlineVideoDownloadResolutions,
	videoDownloadQualityOrder,
} from './offline-video-utils.ts'

type OfflineVideoEntryStatus = 'ready' | 'downloading' | 'error'

export type OfflineVideoDownloadState = {
	status: 'idle' | 'running' | 'completed' | 'error'
	startedAt: string | null
	updatedAt: string
	total: number
	completed: number
	skipped: number
	current: { playbackId: string; title: string } | null
	errors: Array<{ playbackId: string; title: string; error: string }>
}

type OfflineVideoEntry = {
	playbackId: string
	title: string
	url: string
	fileName: string
	status: OfflineVideoEntryStatus
	updatedAt: string
	size?: number
	error?: string
	iv?: string
	keyId?: string
	cryptoVersion?: number
	workshops?: Array<WorkshopIdentity>
}

type OfflineVideoIndex = Record<string, OfflineVideoEntry>

type WorkshopVideoInfo = {
	playbackId: string
	title: string
	url: string
	downloadable: boolean
	downloadSizes: Array<WorkshopVideoDownloadSize>
}

type WorkshopVideoDownloadSize = {
	quality: string
	size: number | null
}

type WorkshopIdentity = {
	id: string
	title: string
}

type WorkshopVideoCollection = {
	videos: Array<WorkshopVideoInfo>
	totalEmbeds: number
	unavailable: number
	notDownloadable: number
}

export type OfflineVideoSummary = {
	totalVideos: number
	downloadedVideos: number
	unavailableVideos: number
	notDownloadableVideos: number
	remainingDownloadBytes: number
	totalBytes: number
	downloadState: OfflineVideoDownloadState
}

export type OfflineVideoStartResult = {
	state: OfflineVideoDownloadState
	available: number
	queued: number
	unavailable: number
	notDownloadable: number
	alreadyDownloaded: number
}

export type OfflineVideoAdminEntry = {
	playbackId: string
	title: string
	url: string
	status: OfflineVideoEntryStatus
	size: number | null
	updatedAt: string
}

export type OfflineVideoAdminWorkshop = WorkshopIdentity & {
	totalBytes: number
	videos: Array<OfflineVideoAdminEntry>
}

export type OfflineVideoAdminSummary = {
	workshops: Array<OfflineVideoAdminWorkshop>
}

type OfflineVideoConfig = {
	version: number
	salt: string
	userId: string | null
}

type OfflineVideoDownloadQuality =
	| 'source'
	| 'highest'
	| 'high'
	| 'medium'
	| 'low'
type EpicVideoDownload = NonNullable<EpicVideoMetadata['downloads']>[number]

function isOfflineVideoDownloadResolution(
	value: unknown,
): value is OfflineVideoDownloadResolution {
	return (
		typeof value === 'string' &&
		offlineVideoDownloadResolutions.includes(
			value as OfflineVideoDownloadResolution,
		)
	)
}

type OfflineVideoKeyInfo = {
	key: Buffer
	keyId: string
	config: OfflineVideoConfig
}

export type OfflineVideoAsset = {
	size: number
	contentType: string
	createStream: (range?: { start: number; end: number }) => Readable
}

const log = logger('epic:offline-videos')
const offlineVideoDirectoryName = 'offline-videos'
const offlineVideoIndexFileName = 'index.json'
const offlineVideoConfigFileName = 'offline-video-config.json'

export type VideoDownloadProgress = {
	playbackId: string
	bytesDownloaded: number
	totalBytes: number | null
	status: 'downloading' | 'complete' | 'error'
}

export const DOWNLOAD_PROGRESS_EVENTS = {
	PROGRESS: 'progress',
} as const

class DownloadProgressEmitter extends EventEmitter {}

export const downloadProgressEmitter = new DownloadProgressEmitter()

function emitDownloadProgress(progress: VideoDownloadProgress) {
	downloadProgressEmitter.emit(DOWNLOAD_PROGRESS_EVENTS.PROGRESS, progress)
}

function formatDownloadError(error: unknown) {
	if (error instanceof Error) {
		return {
			name: error.name,
			message: error.message,
			stack: error.stack,
		}
	}
	return { message: String(error) }
}

let downloadState: OfflineVideoDownloadState = {
	status: 'idle',
	startedAt: null,
	updatedAt: new Date().toISOString(),
	total: 0,
	completed: 0,
	skipped: 0,
	current: null,
	errors: [],
}

function getOfflineVideoDir() {
	return path.join(resolvePrimaryDir(), offlineVideoDirectoryName)
}

function getOfflineVideoIndexPath() {
	return path.join(getOfflineVideoDir(), offlineVideoIndexFileName)
}

function getOfflineVideoConfigPath() {
	return path.join(getOfflineVideoDir(), offlineVideoConfigFileName)
}

function getWorkshopIdentity(): WorkshopIdentity {
	const env = getEnv()
	let title = 'Unknown workshop'
	try {
		title = getWorkshopConfig().title
	} catch {
		// ignore missing workshop config
	}
	return {
		id: env.EPICSHOP_WORKSHOP_INSTANCE_ID || 'unknown',
		title,
	}
}

function getEntryWorkshops(entry: OfflineVideoEntry) {
	const workshops = Array.isArray(entry.workshops)
		? entry.workshops.filter(
				(workshop) =>
					typeof workshop?.id === 'string' &&
					typeof workshop?.title === 'string',
			)
		: []
	return workshops
}

function hasWorkshop(entry: OfflineVideoEntry, workshopId: string) {
	const workshops = getEntryWorkshops(entry)
	return workshops.some((workshop) => workshop.id === workshopId)
}

function ensureWorkshopOnEntry(
	entry: OfflineVideoEntry,
	workshop: WorkshopIdentity,
) {
	const workshops = getEntryWorkshops(entry)
	if (workshops.some((item) => item.id === workshop.id)) return entry
	return { ...entry, workshops: [...workshops, workshop] }
}

function removeWorkshopFromEntry(entry: OfflineVideoEntry, workshopId: string) {
	const workshops = getEntryWorkshops(entry).filter(
		(workshop) => workshop.id !== workshopId,
	)
	return { ...entry, workshops }
}

async function ensureOfflineVideoDir() {
	const dir = getOfflineVideoDir()
	await fs.mkdir(dir, { recursive: true, mode: 0o700 })
	try {
		await fs.chmod(dir, 0o700)
	} catch {
		// ignore chmod failures
	}
}

function normalizeEmbedUrl(url: string) {
	return url.endsWith('/') ? url.slice(0, -1) : url
}

function getPlaybackIdHash(playbackId: string) {
	return createHash('sha256').update(playbackId).digest('hex')
}

function getOfflineVideoFileName(playbackId: string) {
	return `${getPlaybackIdHash(playbackId)}.mp4`
}

function getOfflineVideoFilePath(playbackId: string) {
	return path.join(getOfflineVideoDir(), getOfflineVideoFileName(playbackId))
}

async function readOfflineVideoIndex(): Promise<OfflineVideoIndex> {
	const indexPath = getOfflineVideoIndexPath()
	try {
		const json = await fs.readFile(indexPath, 'utf8')
		return JSON.parse(json) as OfflineVideoIndex
	} catch {
		return {}
	}
}

async function readOfflineVideoConfig(): Promise<OfflineVideoConfig | null> {
	const configPath = getOfflineVideoConfigPath()
	try {
		const json = await fs.readFile(configPath, 'utf8')
		const parsed = JSON.parse(json) as Record<string, unknown>
		if (!parsed) return null
		const version =
			typeof parsed.version === 'number'
				? parsed.version
				: OFFLINE_VIDEO_CRYPTO_VERSION
		if (version !== OFFLINE_VIDEO_CRYPTO_VERSION) return null
		if (typeof parsed.salt !== 'string') return null
		const userId = typeof parsed.userId === 'string' ? parsed.userId : null
		return { version, salt: parsed.salt, userId }
	} catch {
		return null
	}
}

async function writeOfflineVideoIndex(index: OfflineVideoIndex) {
	await ensureOfflineVideoDir()
	const tmpPath = path.join(getOfflineVideoDir(), `.tmp-${randomUUID()}`)
	await fs.writeFile(tmpPath, JSON.stringify(index, null, 2), { mode: 0o600 })
	await fs.rename(tmpPath, getOfflineVideoIndexPath())
}

async function writeOfflineVideoConfig(config: OfflineVideoConfig) {
	await ensureOfflineVideoDir()
	const tmpPath = path.join(getOfflineVideoDir(), `.tmp-${randomUUID()}`)
	await fs.writeFile(tmpPath, JSON.stringify(config, null, 2), { mode: 0o600 })
	await fs.rename(tmpPath, getOfflineVideoConfigPath())
}

async function ensureOfflineVideoConfig({
	userId,
}: {
	userId: string | null
}): Promise<OfflineVideoConfig> {
	const existing = await readOfflineVideoConfig()
	let config = existing
	let shouldWrite = false

	if (!config) {
		config = {
			version: OFFLINE_VIDEO_CRYPTO_VERSION,
			salt: createOfflineVideoSalt(),
			userId: userId ?? null,
		}
		shouldWrite = true
	} else if (config.version !== OFFLINE_VIDEO_CRYPTO_VERSION) {
		config = {
			version: OFFLINE_VIDEO_CRYPTO_VERSION,
			salt: createOfflineVideoSalt(),
			userId: config.userId ?? null,
		}
		shouldWrite = true
	}

	if (userId && userId !== config.userId) {
		config = {
			version: OFFLINE_VIDEO_CRYPTO_VERSION,
			salt: createOfflineVideoSalt(),
			userId,
		}
		shouldWrite = true
	}

	if (shouldWrite) {
		await writeOfflineVideoConfig(config)
	}

	return config
}

async function getOfflineVideoKeyInfo({
	userId,
	allowUserIdUpdate,
}: {
	userId: string | null
	allowUserIdUpdate: boolean
}): Promise<OfflineVideoKeyInfo | null> {
	const config = allowUserIdUpdate
		? await ensureOfflineVideoConfig({ userId })
		: await readOfflineVideoConfig()
	if (!config || config.version !== OFFLINE_VIDEO_CRYPTO_VERSION) return null
	const clientId = await getClientId()
	const keyInfo = deriveOfflineVideoKey({
		salt: config.salt,
		clientId,
		userId: config.userId,
		version: config.version,
	})
	return { ...keyInfo, config }
}

function createSliceTransform({
	skipBytes,
	takeBytes,
}: {
	skipBytes: number
	takeBytes: number
}) {
	let skipped = 0
	let taken = 0
	return new Transform({
		transform(chunk, _encoding, callback) {
			let buffer = chunk as Buffer
			if (skipped < skipBytes) {
				const toSkip = Math.min(skipBytes - skipped, buffer.length)
				buffer = buffer.slice(toSkip)
				skipped += toSkip
			}
			if (buffer.length === 0 || taken >= takeBytes) {
				return callback()
			}
			const remaining = takeBytes - taken
			const output = buffer.slice(0, remaining)
			taken += output.length
			return callback(null, output)
		},
	})
}

function createProgressTrackingTransform({
	onProgress,
}: {
	onProgress: (bytesDownloaded: number) => void
}) {
	let totalBytes = 0
	return new Transform({
		transform(chunk, _encoding, callback) {
			totalBytes += (chunk as Buffer).length
			onProgress(totalBytes)
			callback(null, chunk)
		},
	})
}

function createOfflineVideoReadStream({
	filePath,
	size,
	key,
	iv,
	range,
}: {
	filePath: string
	size: number
	key: Buffer
	iv: Buffer
	range?: { start: number; end: number }
}) {
	if (!range) {
		const decipher = createOfflineVideoDecipher({ key, iv })
		return createReadStream(filePath).pipe(decipher)
	}

	const cryptoRange = getCryptoRange({ start: range.start, end: range.end })
	const alignedEnd = Math.min(cryptoRange.alignedEnd, size - 1)
	const rangeIv = incrementIv(iv, cryptoRange.blockIndex)
	const decipher = createOfflineVideoDecipher({ key, iv: rangeIv })
	const slice = createSliceTransform({
		skipBytes: cryptoRange.skipBytes,
		takeBytes: cryptoRange.takeBytes,
	})

	return createReadStream(filePath, {
		start: cryptoRange.alignedStart,
		end: alignedEnd,
	})
		.pipe(decipher)
		.pipe(slice)
}
async function getWorkshopVideoCollection({
	request,
}: { request?: Request } = {}): Promise<WorkshopVideoCollection> {
	const [workshopInstructions, workshopFinished, exercises, apps] =
		await Promise.all([
			getWorkshopInstructions({ request }),
			getWorkshopFinished({ request }),
			getExercises({ request }),
			getApps({ request }),
		])

	const embedUrls = new Set<string>()
	const addEmbeds = (embeds?: Array<string> | null) => {
		if (!embeds) return
		for (const url of embeds) {
			if (!url) continue
			embedUrls.add(normalizeEmbedUrl(url))
		}
	}

	if (workshopInstructions.compiled.status === 'success') {
		addEmbeds(workshopInstructions.compiled.epicVideoEmbeds)
	}
	if (workshopFinished.compiled.status === 'success') {
		addEmbeds(workshopFinished.compiled.epicVideoEmbeds)
	}

	for (const exercise of exercises) {
		addEmbeds(exercise.instructionsEpicVideoEmbeds)
		addEmbeds(exercise.finishedEpicVideoEmbeds)
		for (const step of exercise.steps ?? []) {
			addEmbeds(step.problem?.epicVideoEmbeds)
			addEmbeds(step.solution?.epicVideoEmbeds)
		}
	}

	for (const app of apps) {
		addEmbeds(app.epicVideoEmbeds)
	}

	const embedList = Array.from(embedUrls)
	const epicVideoInfos = await getEpicVideoInfos(embedList, { request })
	const videos: Array<WorkshopVideoInfo> = []
	let unavailable = 0
	let notDownloadable = 0

	for (const embed of embedList) {
		const info = epicVideoInfos[embed]
		if (!info || info.status !== 'success') {
			unavailable += 1
			continue
		}
		const downloadSizes = Array.isArray(info.downloadSizes)
			? info.downloadSizes
			: []
		const downloadable = info.downloadsAvailable === true
		if (!downloadable) {
			notDownloadable += 1
		}
		videos.push({
			playbackId: info.muxPlaybackId,
			title: info.title ?? embed,
			url: embed,
			downloadable,
			downloadSizes,
		})
	}

	return { videos, totalEmbeds: embedUrls.size, unavailable, notDownloadable }
}

async function getOfflineVideoDownloadResolution(): Promise<OfflineVideoDownloadResolution> {
	const preferences = await getPreferences()
	const resolution = preferences?.offlineVideo?.downloadResolution
	if (isOfflineVideoDownloadResolution(resolution)) {
		return resolution
	}
	return 'best'
}

const knownDownloadQualities = new Set<OfflineVideoDownloadQuality>([
	'source',
	'highest',
	'high',
	'medium',
	'low',
])

function normalizeDownloadQuality(
	quality: string,
): OfflineVideoDownloadQuality | null {
	const normalized = quality.toLowerCase()
	return knownDownloadQualities.has(normalized as OfflineVideoDownloadQuality)
		? (normalized as OfflineVideoDownloadQuality)
		: null
}

function sortVideoDownloads(
	downloads: Array<EpicVideoDownload>,
	resolution: OfflineVideoDownloadResolution,
) {
	const order =
		videoDownloadQualityOrder[resolution] ?? videoDownloadQualityOrder.best
	const qualityRank = new Map(order.map((quality, index) => [quality, index]))
	return [...downloads].sort((a, b) => {
		const aQuality = normalizeDownloadQuality(a.quality)
		const bQuality = normalizeDownloadQuality(b.quality)
		const aRank = aQuality
			? (qualityRank.get(aQuality) ?? order.length)
			: order.length + 1
		const bRank = bQuality
			? (qualityRank.get(bQuality) ?? order.length)
			: order.length + 1
		if (aRank !== bRank) return aRank - bRank
		const aWidth = a.width ?? 0
		const bWidth = b.width ?? 0
		if (aWidth !== bWidth) return bWidth - aWidth
		const aBitrate = a.bitrate ?? 0
		const bBitrate = b.bitrate ?? 0
		return bBitrate - aBitrate
	})
}

function getVideoApiHost(videoUrl: string) {
	try {
		const host = new URL(videoUrl).host
		return normalizeVideoApiHost(host)
	} catch (error) {
		log.warn('Unable to parse video URL for metadata', {
			videoUrl,
			error: formatDownloadError(error),
		})
		return null
	}
}

async function getVideoDownloadUrls({
	playbackId,
	videoUrl,
	resolution,
	accessToken,
}: {
	playbackId: string
	videoUrl: string
	resolution: OfflineVideoDownloadResolution
	accessToken?: string
}) {
	const host = getVideoApiHost(videoUrl)
	if (!host) {
		log.warn('No video API host found for offline download', {
			playbackId,
			videoUrl,
		})
		return []
	}
	const metadata = await getEpicVideoMetadata({
		playbackId,
		host,
		accessToken,
	})
	if (!metadata) {
		log.warn('Video metadata unavailable for offline download', {
			playbackId,
			videoUrl,
		})
		return []
	}
	const downloads = metadata.downloads ?? []
	if (downloads.length === 0) {
		log.warn('Video metadata missing downloads for offline download', {
			playbackId,
			videoUrl,
			status: metadata.status,
		})
		return []
	}
	const ordered = sortVideoDownloads(downloads, resolution)
	const urls = ordered.map((download) => download.url).filter(Boolean)
	if (urls.length === 0) {
		log.warn('Video metadata has downloads but all URLs are invalid', {
			playbackId,
			videoUrl,
			downloadsCount: downloads.length,
		})
		return []
	}
	return urls
}

async function isOfflineVideoReady(
	index: OfflineVideoIndex,
	playbackId: string,
	keyId: string,
	cryptoVersion: number,
	workshop: WorkshopIdentity,
) {
	const entry = index[playbackId]
	if (!entry || entry.status !== 'ready') return false
	if (entry.keyId !== keyId || entry.cryptoVersion !== cryptoVersion)
		return false
	if (!hasWorkshop(entry, workshop.id)) return false
	const filePath = entry.fileName
		? path.join(getOfflineVideoDir(), entry.fileName)
		: getOfflineVideoFilePath(playbackId)
	try {
		const stat = await fs.stat(filePath)
		return stat.size > 0
	} catch {
		return false
	}
}

async function downloadVideo({
	playbackId,
	filePath,
	key,
	iv,
	resolution,
	videoUrl,
	accessToken,
}: {
	playbackId: string
	filePath: string
	key: Buffer
	iv: Buffer
	resolution: OfflineVideoDownloadResolution
	videoUrl: string
	accessToken?: string
}) {
	const urls = await getVideoDownloadUrls({
		playbackId,
		videoUrl,
		resolution,
		accessToken,
	})
	if (urls.length === 0) {
		throw new Error(`No download URLs available for ${playbackId}`)
	}
	let lastError: Error | null = null
	const attempts: Array<{
		url: string
		status?: number
		statusText?: string
		hasBody?: boolean
		error?: string
	}> = []

	emitDownloadProgress({
		playbackId,
		bytesDownloaded: 0,
		totalBytes: null,
		status: 'downloading',
	})

	for (const url of urls) {
		log.info('Attempting video download', { playbackId, url })
		const response = await fetch(url).catch((error) => {
			const message = error instanceof Error ? error.message : String(error)
			lastError = error instanceof Error ? error : new Error(message)
			log.warn('Video download request failed', {
				playbackId,
				url,
				message,
			})
			attempts.push({ url, error: message })
			return null
		})
		if (!response) continue
		if (!response.ok || !response.body) {
			lastError = new Error(
				`Failed to download ${playbackId} from ${url} (${response.status})`,
			)
			log.warn('Video download response not ok', {
				playbackId,
				url,
				status: response.status,
				statusText: response.statusText,
				hasBody: Boolean(response.body),
			})
			attempts.push({
				url,
				status: response.status,
				statusText: response.statusText,
				hasBody: Boolean(response.body),
			})
			continue
		}

		// Get content-length if available for progress tracking
		const contentLengthHeader = response.headers.get('content-length')
		const totalBytes = contentLengthHeader
			? parseInt(contentLengthHeader, 10)
			: null

		emitDownloadProgress({
			playbackId,
			bytesDownloaded: 0,
			totalBytes,
			status: 'downloading',
		})

		await ensureOfflineVideoDir()
		const tmpPath = `${filePath}.tmp-${randomUUID()}`
		const stream = createWriteStream(tmpPath, { mode: 0o600 })
		const cipher = createOfflineVideoCipher({ key, iv })
		const progressTracker = createProgressTrackingTransform({
			onProgress: (bytesDownloaded) => {
				emitDownloadProgress({
					playbackId,
					bytesDownloaded,
					totalBytes,
					status: 'downloading',
				})
			},
		})
		const webStream = response.body as unknown as AsyncIterable<Uint8Array>
		await pipeline(Readable.from(webStream), progressTracker, cipher, stream)
		await fs.rename(tmpPath, filePath)
		const stat = await fs.stat(filePath)
		emitDownloadProgress({
			playbackId,
			bytesDownloaded: stat.size,
			totalBytes: stat.size,
			status: 'complete',
		})
		log.info('Video download complete', {
			playbackId,
			url,
			size: stat.size,
		})
		return { size: stat.size }
	}

	emitDownloadProgress({
		playbackId,
		bytesDownloaded: 0,
		totalBytes: null,
		status: 'error',
	})

	log.error('Video download failed', {
		playbackId,
		resolution,
		attempts,
		error: lastError ? formatDownloadError(lastError) : null,
	})

	throw lastError ?? new Error(`Unable to download video ${playbackId}`)
}

async function runOfflineVideoDownloads({
	videos,
	index,
	keyInfo,
	workshop,
	resolution,
	accessToken,
}: {
	videos: Array<WorkshopVideoInfo>
	index: OfflineVideoIndex
	keyInfo: OfflineVideoKeyInfo
	workshop: WorkshopIdentity
	resolution: OfflineVideoDownloadResolution
	accessToken?: string
}) {
	for (const video of videos) {
		const updatedAt = new Date().toISOString()
		downloadState.current = {
			playbackId: video.playbackId,
			title: video.title,
		}
		downloadState.updatedAt = updatedAt
		log.info('Downloading offline video', {
			playbackId: video.playbackId,
			title: video.title,
		})

		const iv = createOfflineVideoIv()
		const entry: OfflineVideoEntry = {
			playbackId: video.playbackId,
			title: video.title,
			url: video.url,
			fileName: getOfflineVideoFileName(video.playbackId),
			status: 'downloading',
			updatedAt,
			iv: encodeOfflineVideoIv(iv),
			keyId: keyInfo.keyId,
			cryptoVersion: keyInfo.config.version,
			workshops: [workshop],
		}
		index[video.playbackId] = entry
		await writeOfflineVideoIndex(index)

		try {
			const { size } = await downloadVideo({
				playbackId: video.playbackId,
				filePath: path.join(getOfflineVideoDir(), entry.fileName),
				key: keyInfo.key,
				iv,
				resolution,
				videoUrl: video.url,
				accessToken,
			})
			index[video.playbackId] = {
				...entry,
				status: 'ready',
				size,
				updatedAt: new Date().toISOString(),
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Download failed'
			downloadState.errors.push({
				playbackId: video.playbackId,
				title: video.title,
				error: message,
			})
			index[video.playbackId] = {
				...entry,
				status: 'error',
				error: message,
				updatedAt: new Date().toISOString(),
			}
			log.error('Offline video download failed', {
				playbackId: video.playbackId,
				title: video.title,
				url: video.url,
				resolution,
				fileName: entry.fileName,
				filePath: path.join(getOfflineVideoDir(), entry.fileName),
				error: formatDownloadError(error),
			})
		} finally {
			downloadState.completed += 1
			downloadState.current = null
			downloadState.updatedAt = new Date().toISOString()
			await writeOfflineVideoIndex(index)
		}
	}

	downloadState.status = downloadState.errors.length > 0 ? 'error' : 'completed'
	downloadState.updatedAt = new Date().toISOString()
}

export function getOfflineVideoDownloadState() {
	return downloadState
}

export async function getOfflineVideoSummary({
	request,
}: { request?: Request } = {}): Promise<OfflineVideoSummary> {
	const workshop = getWorkshopIdentity()
	const { videos, unavailable, notDownloadable } =
		await getWorkshopVideoCollection({ request })
	const index = await readOfflineVideoIndex()
	const resolution = await getOfflineVideoDownloadResolution()
	const keyInfo = await getOfflineVideoKeyInfo({
		userId: null,
		allowUserIdUpdate: false,
	})
	let downloadedVideos = 0
	let totalBytes = 0
	let remainingDownloadBytes = 0

	for (const video of videos) {
		const entry = index[video.playbackId]
		const isDownloaded = Boolean(
			entry?.status === 'ready' &&
			keyInfo?.keyId &&
			entry.keyId === keyInfo.keyId &&
			entry.cryptoVersion === keyInfo.config.version &&
			hasWorkshop(entry, workshop.id),
		)
		if (isDownloaded && entry) {
			downloadedVideos += 1
			totalBytes += entry.size ?? 0
			continue
		}
		if (!video.downloadable) continue
		const size = getPreferredDownloadSize(video.downloadSizes, resolution)
		if (typeof size === 'number') {
			remainingDownloadBytes += size
		}
	}

	return {
		totalVideos: videos.length,
		downloadedVideos,
		unavailableVideos: unavailable,
		notDownloadableVideos: notDownloadable,
		remainingDownloadBytes,
		totalBytes,
		downloadState,
	}
}

export async function getOfflineVideoPlaybackIds(): Promise<Array<string> | null> {
	try {
		const workshop = getWorkshopIdentity()
		const keyInfo = await getOfflineVideoKeyInfo({
			userId: null,
			allowUserIdUpdate: false,
		})
		if (!keyInfo) return []
		const index = await readOfflineVideoIndex()
		const playbackIds: Array<string> = []

		for (const [playbackId, entry] of Object.entries(index)) {
			if (entry.status !== 'ready') continue
			if (entry.keyId !== keyInfo.keyId) continue
			if (entry.cryptoVersion !== keyInfo.config.version) continue
			if (!hasWorkshop(entry, workshop.id)) continue
			if (typeof entry.size === 'number' && entry.size <= 0) continue
			playbackIds.push(playbackId)
		}

		return playbackIds
	} catch (error) {
		log.warn('Failed to load offline video playback ids', {
			error: formatDownloadError(error),
		})
		return null
	}
}

export async function warmOfflineVideoSummary() {
	await getWorkshopVideoCollection()
}

export async function startOfflineVideoDownload({
	request,
}: { request?: Request } = {}): Promise<OfflineVideoStartResult> {
	if (getEnv().EPICSHOP_DEPLOYED) {
		return {
			state: downloadState,
			available: 0,
			queued: 0,
			unavailable: 0,
			notDownloadable: 0,
			alreadyDownloaded: 0,
		}
	}

	if (downloadState.status === 'running') {
		return {
			state: downloadState,
			available: downloadState.total + downloadState.skipped,
			queued: downloadState.total,
			unavailable: 0,
			notDownloadable: 0,
			alreadyDownloaded: downloadState.skipped,
		}
	}

	// Set status immediately to prevent race condition
	const tempStartedAt = new Date().toISOString()
	downloadState = {
		status: 'running',
		startedAt: tempStartedAt,
		updatedAt: tempStartedAt,
		total: 0,
		completed: 0,
		skipped: 0,
		current: null,
		errors: [],
	}

	const workshop = getWorkshopIdentity()
	const { videos, unavailable, notDownloadable } =
		await getWorkshopVideoCollection({ request })
	const downloadableVideos = videos.filter((video) => video.downloadable)
	const index = await readOfflineVideoIndex()
	const authInfo = await getAuthInfo()
	const keyInfo = await getOfflineVideoKeyInfo({
		userId: authInfo?.id ?? null,
		allowUserIdUpdate: true,
	})
	if (!keyInfo) {
		log.warn('Offline video download unavailable: missing key info', {
			available: downloadableVideos.length,
			unavailable,
		})
		return {
			state: downloadState,
			available: downloadableVideos.length,
			queued: 0,
			unavailable,
			notDownloadable,
			alreadyDownloaded: 0,
		}
	}
	const downloads: Array<WorkshopVideoInfo> = []
	let alreadyDownloaded = 0

	for (const video of downloadableVideos) {
		const entry = index[video.playbackId]
		if (
			entry?.status === 'ready' &&
			entry.keyId === keyInfo.keyId &&
			entry.cryptoVersion === keyInfo.config.version
		) {
			if (!hasWorkshop(entry, workshop.id)) {
				index[video.playbackId] = ensureWorkshopOnEntry(entry, workshop)
				await writeOfflineVideoIndex(index)
			}
			alreadyDownloaded += 1
			continue
		}
		if (
			await isOfflineVideoReady(
				index,
				video.playbackId,
				keyInfo.keyId,
				keyInfo.config.version,
				workshop,
			)
		) {
			alreadyDownloaded += 1
			continue
		}
		downloads.push(video)
	}

	const startedAt = new Date().toISOString()
	downloadState = {
		status: downloads.length > 0 ? 'running' : 'completed',
		startedAt,
		updatedAt: startedAt,
		total: downloads.length,
		completed: 0,
		skipped: alreadyDownloaded,
		current: null,
		errors: [],
	}
	log.info('Offline video downloads queued', {
		queued: downloads.length,
		skipped: alreadyDownloaded,
		unavailable,
	})

	if (downloads.length > 0) {
		const resolution = await getOfflineVideoDownloadResolution()
		void runOfflineVideoDownloads({
			videos: downloads,
			index,
			keyInfo,
			workshop,
			resolution,
			accessToken: authInfo?.tokenSet.access_token,
		}).catch((error) => {
			log.error('Offline video downloads failed', error)
			downloadState.status = 'error'
			downloadState.updatedAt = new Date().toISOString()
		})
	}

	return {
		state: downloadState,
		available: downloadableVideos.length,
		queued: downloads.length,
		unavailable,
		notDownloadable,
		alreadyDownloaded,
	}
}

export async function downloadOfflineVideo({
	playbackId,
	title,
	url,
}: {
	playbackId: string
	title: string
	url: string
}) {
	log.info('Offline video download requested', { playbackId, title, url })
	const workshop = getWorkshopIdentity()
	const index = await readOfflineVideoIndex()
	const authInfo = await getAuthInfo()
	const keyInfo = await getOfflineVideoKeyInfo({
		userId: authInfo?.id ?? null,
		allowUserIdUpdate: true,
	})
	if (!keyInfo) {
		log.warn('Offline video download failed: missing key info', {
			playbackId,
		})
		const message = `Unable to download "${title}". Try again later.`
		return {
			status: 'error',
			message,
		} as const
	}
	const resolution = await getOfflineVideoDownloadResolution()

	const existing = index[playbackId]
	if (
		existing?.status === 'ready' &&
		existing.keyId === keyInfo.keyId &&
		existing.cryptoVersion === keyInfo.config.version
	) {
		const updated = ensureWorkshopOnEntry(existing, workshop)
		if (updated !== existing) {
			index[playbackId] = updated
			await writeOfflineVideoIndex(index)
		}
		return { status: 'ready' } as const
	}

	const updatedAt = new Date().toISOString()
	const iv = createOfflineVideoIv()
	const entry: OfflineVideoEntry = {
		playbackId,
		title,
		url,
		fileName: getOfflineVideoFileName(playbackId),
		status: 'downloading',
		updatedAt,
		iv: encodeOfflineVideoIv(iv),
		keyId: keyInfo.keyId,
		cryptoVersion: keyInfo.config.version,
		workshops: [workshop],
	}
	index[playbackId] = entry
	await writeOfflineVideoIndex(index)

	try {
		const { size } = await downloadVideo({
			playbackId,
			filePath: path.join(getOfflineVideoDir(), entry.fileName),
			key: keyInfo.key,
			iv,
			resolution,
			videoUrl: url,
			accessToken: authInfo?.tokenSet.access_token,
		})
		index[playbackId] = {
			...entry,
			status: 'ready',
			size,
			updatedAt: new Date().toISOString(),
		}
		await writeOfflineVideoIndex(index)
		log.info('Offline video download complete', { playbackId, size })
		return { status: 'downloaded' } as const
	} catch (error) {
		const detailedMessage =
			error instanceof Error ? error.message : 'Download failed'
		const message = `Failed to download "${title}". Please try again.`
		log.error('Offline video download failed', {
			playbackId,
			title,
			url,
			resolution,
			fileName: entry.fileName,
			filePath: path.join(getOfflineVideoDir(), entry.fileName),
			error: formatDownloadError(error),
		})
		index[playbackId] = {
			...entry,
			status: 'error',
			error: detailedMessage,
			updatedAt: new Date().toISOString(),
		}
		await writeOfflineVideoIndex(index)
		return { status: 'error', message } as const
	}
}

export async function deleteOfflineVideo(
	playbackId: string,
	options?: { workshopId?: string },
) {
	const workshop = options?.workshopId
		? { id: options.workshopId, title: '' }
		: getWorkshopIdentity()
	const index = await readOfflineVideoIndex()
	const entry = index[playbackId]
	if (!entry) return { status: 'missing' } as const

	const nextEntry = removeWorkshopFromEntry(entry, workshop.id)
	if (nextEntry.workshops && nextEntry.workshops.length > 0) {
		index[playbackId] = nextEntry
		await writeOfflineVideoIndex(index)
		return { status: 'removed' } as const
	}

	const filePath = entry.fileName
		? path.join(getOfflineVideoDir(), entry.fileName)
		: getOfflineVideoFilePath(playbackId)
	delete index[playbackId]
	await writeOfflineVideoIndex(index)
	await fs.rm(filePath, { force: true })
	return { status: 'deleted' } as const
}

export async function deleteOfflineVideosForWorkshop() {
	const workshop = getWorkshopIdentity()
	const index = await readOfflineVideoIndex()
	let deletedFiles = 0
	let removedEntries = 0

	for (const [playbackId, entry] of Object.entries(index)) {
		if (!hasWorkshop(entry, workshop.id)) continue
		const nextEntry = removeWorkshopFromEntry(entry, workshop.id)
		if (nextEntry.workshops && nextEntry.workshops.length > 0) {
			index[playbackId] = nextEntry
			continue
		}
		const filePath = entry.fileName
			? path.join(getOfflineVideoDir(), entry.fileName)
			: getOfflineVideoFilePath(playbackId)
		delete index[playbackId]
		removedEntries += 1
		await fs.rm(filePath, { force: true })
		deletedFiles += 1
	}

	await writeOfflineVideoIndex(index)
	return { deletedFiles, removedEntries } as const
}

export async function deleteOfflineVideosForWorkshopId(workshopId: string) {
	const index = await readOfflineVideoIndex()
	let deletedFiles = 0
	let removedEntries = 0

	for (const [playbackId, entry] of Object.entries(index)) {
		if (!hasWorkshop(entry, workshopId)) continue
		const nextEntry = removeWorkshopFromEntry(entry, workshopId)
		if (nextEntry.workshops && nextEntry.workshops.length > 0) {
			index[playbackId] = nextEntry
			continue
		}
		const filePath = entry.fileName
			? path.join(getOfflineVideoDir(), entry.fileName)
			: getOfflineVideoFilePath(playbackId)
		delete index[playbackId]
		removedEntries += 1
		await fs.rm(filePath, { force: true })
		deletedFiles += 1
	}

	await writeOfflineVideoIndex(index)
	return { deletedFiles, removedEntries } as const
}

export async function deleteAllOfflineVideos() {
	const index = await readOfflineVideoIndex()
	let deletedFiles = 0

	for (const entry of Object.values(index)) {
		const filePath = entry.fileName
			? path.join(getOfflineVideoDir(), entry.fileName)
			: getOfflineVideoFilePath(entry.playbackId)
		await fs.rm(filePath, { force: true })
		deletedFiles += 1
	}

	await writeOfflineVideoIndex({})
	return { deletedFiles } as const
}

export async function getOfflineVideoAdminSummary(): Promise<OfflineVideoAdminSummary> {
	const index = await readOfflineVideoIndex()
	const workshops = new Map<string, OfflineVideoAdminWorkshop>()

	for (const [playbackId, entry] of Object.entries(index)) {
		const entryWorkshops = getEntryWorkshops(entry)
		for (const workshop of entryWorkshops) {
			const existing = workshops.get(workshop.id) ?? {
				...workshop,
				totalBytes: 0,
				videos: [],
			}
			existing.videos.push({
				playbackId,
				title: entry.title,
				url: entry.url,
				status: entry.status,
				size: entry.size ?? null,
				updatedAt: entry.updatedAt,
			})
			existing.totalBytes += entry.size ?? 0
			workshops.set(workshop.id, existing)
		}
	}

	return {
		workshops: Array.from(workshops.values()).sort((a, b) =>
			a.title.localeCompare(b.title),
		),
	}
}

export async function getOfflineVideoAsset(
	playbackId: string,
): Promise<OfflineVideoAsset | null> {
	const workshop = getWorkshopIdentity()
	const keyInfo = await getOfflineVideoKeyInfo({
		userId: null,
		allowUserIdUpdate: false,
	})
	if (!keyInfo) return null

	const index = await readOfflineVideoIndex()
	const entry = index[playbackId]
	if (
		!entry ||
		entry.status !== 'ready' ||
		entry.keyId !== keyInfo.keyId ||
		entry.cryptoVersion !== keyInfo.config.version ||
		!entry.iv ||
		!hasWorkshop(entry, workshop.id)
	) {
		return null
	}
	const filePath = entry.fileName
		? path.join(getOfflineVideoDir(), entry.fileName)
		: getOfflineVideoFilePath(playbackId)
	try {
		const stat = await fs.stat(filePath)
		if (stat.size === 0) return null
		const iv = decodeOfflineVideoIv(entry.iv)
		return {
			size: stat.size,
			contentType: 'video/mp4',
			createStream: (range) =>
				createOfflineVideoReadStream({
					filePath,
					size: stat.size,
					key: keyInfo.key,
					iv,
					range,
				}),
		}
	} catch {
		return null
	}
}
