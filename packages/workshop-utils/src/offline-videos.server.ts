import { createHash, randomUUID } from 'node:crypto'
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
import { getAuthInfo, getClientId } from './db.server.ts'
import { getEpicVideoInfos } from './epic-api.server.ts'
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
}

type WorkshopIdentity = {
	id: string
	title: string
}

type WorkshopVideoCollection = {
	videos: Array<WorkshopVideoInfo>
	totalEmbeds: number
	unavailable: number
}

export type OfflineVideoSummary = {
	totalVideos: number
	downloadedVideos: number
	unavailableVideos: number
	totalBytes: number
	downloadState: OfflineVideoDownloadState
}

export type OfflineVideoStartResult = {
	state: OfflineVideoDownloadState
	available: number
	queued: number
	unavailable: number
	alreadyDownloaded: number
}

export type OfflineVideoAdminEntry = {
	playbackId: string
	title: string
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

	for (const embed of embedList) {
		const info = epicVideoInfos[embed]
		if (!info || info.status !== 'success') {
			unavailable += 1
			continue
		}
		videos.push({
			playbackId: info.muxPlaybackId,
			title: info.title ?? embed,
			url: embed,
		})
	}

	return { videos, totalEmbeds: embedUrls.size, unavailable }
}

function getMuxMp4Urls(playbackId: string) {
	return [
		`https://stream.mux.com/${playbackId}/high.mp4`,
		`https://stream.mux.com/${playbackId}/medium.mp4`,
		`https://stream.mux.com/${playbackId}/low.mp4`,
		`https://stream.mux.com/${playbackId}.mp4`,
	]
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

async function downloadMuxVideo({
	playbackId,
	filePath,
	key,
	iv,
}: {
	playbackId: string
	filePath: string
	key: Buffer
	iv: Buffer
}) {
	const urls = getMuxMp4Urls(playbackId)
	let lastError: Error | null = null

	for (const url of urls) {
		const response = await fetch(url).catch((error) => {
			lastError = error as Error
			return null
		})
		if (!response) continue
		if (!response.ok || !response.body) {
			lastError = new Error(
				`Failed to download ${playbackId} from ${url} (${response.status})`,
			)
			continue
		}

		await ensureOfflineVideoDir()
		const tmpPath = `${filePath}.tmp-${randomUUID()}`
		const stream = createWriteStream(tmpPath, { mode: 0o600 })
		const cipher = createOfflineVideoCipher({ key, iv })
		const webStream = response.body as unknown as AsyncIterable<Uint8Array>
		await pipeline(Readable.from(webStream), cipher, stream)
		await fs.rename(tmpPath, filePath)
		const stat = await fs.stat(filePath)
		return { size: stat.size }
	}

	throw lastError ?? new Error(`Unable to download video ${playbackId}`)
}

async function runOfflineVideoDownloads({
	videos,
	index,
	keyInfo,
	workshop,
}: {
	videos: Array<WorkshopVideoInfo>
	index: OfflineVideoIndex
	keyInfo: OfflineVideoKeyInfo
	workshop: WorkshopIdentity
}) {
	for (const video of videos) {
		const updatedAt = new Date().toISOString()
		downloadState.current = {
			playbackId: video.playbackId,
			title: video.title,
		}
		downloadState.updatedAt = updatedAt

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
			const { size } = await downloadMuxVideo({
				playbackId: video.playbackId,
				filePath: path.join(getOfflineVideoDir(), entry.fileName),
				key: keyInfo.key,
				iv,
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
			log.error(`Download failed for ${video.playbackId}`, error)
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
	const { videos, unavailable } = await getWorkshopVideoCollection({ request })
	const index = await readOfflineVideoIndex()
	const keyInfo = await getOfflineVideoKeyInfo({
		userId: null,
		allowUserIdUpdate: false,
	})
	let downloadedVideos = 0
	let totalBytes = 0

	for (const video of videos) {
		const entry = index[video.playbackId]
		if (
			entry?.status === 'ready' &&
			keyInfo &&
			entry.keyId === keyInfo.keyId &&
			entry.cryptoVersion === keyInfo.config.version &&
			hasWorkshop(entry, workshop.id)
		) {
			downloadedVideos += 1
			totalBytes += entry.size ?? 0
		}
	}

	return {
		totalVideos: videos.length,
		downloadedVideos,
		unavailableVideos: unavailable,
		totalBytes,
		downloadState,
	}
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
			alreadyDownloaded: 0,
		}
	}

	if (downloadState.status === 'running') {
		return {
			state: downloadState,
			available: downloadState.total + downloadState.skipped,
			queued: downloadState.total,
			unavailable: 0,
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
	const { videos, unavailable } = await getWorkshopVideoCollection({ request })
	const index = await readOfflineVideoIndex()
	const authInfo = await getAuthInfo()
	const keyInfo = await getOfflineVideoKeyInfo({
		userId: authInfo?.id ?? null,
		allowUserIdUpdate: true,
	})
	if (!keyInfo) {
		return {
			state: downloadState,
			available: videos.length,
			queued: 0,
			unavailable,
			alreadyDownloaded: 0,
		}
	}
	const downloads: Array<WorkshopVideoInfo> = []
	let alreadyDownloaded = 0

	for (const video of videos) {
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

	if (downloads.length > 0) {
		void runOfflineVideoDownloads({
			videos: downloads,
			index,
			keyInfo,
			workshop,
		}).catch((error) => {
			log.error('Offline video downloads failed', error)
			downloadState.status = 'error'
			downloadState.updatedAt = new Date().toISOString()
		})
	}

	return {
		state: downloadState,
		available: videos.length,
		queued: downloads.length,
		unavailable,
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
	const workshop = getWorkshopIdentity()
	const index = await readOfflineVideoIndex()
	const authInfo = await getAuthInfo()
	const keyInfo = await getOfflineVideoKeyInfo({
		userId: authInfo?.id ?? null,
		allowUserIdUpdate: true,
	})
	if (!keyInfo) return { status: 'error' } as const

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
		const { size } = await downloadMuxVideo({
			playbackId,
			filePath: path.join(getOfflineVideoDir(), entry.fileName),
			key: keyInfo.key,
			iv,
		})
		index[playbackId] = {
			...entry,
			status: 'ready',
			size,
			updatedAt: new Date().toISOString(),
		}
		await writeOfflineVideoIndex(index)
		return { status: 'downloaded' } as const
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Download failed'
		index[playbackId] = {
			...entry,
			status: 'error',
			error: message,
			updatedAt: new Date().toISOString(),
		}
		await writeOfflineVideoIndex(index)
		return { status: 'error' } as const
	}
}

export async function deleteOfflineVideo(playbackId: string) {
	const workshop = getWorkshopIdentity()
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
