import { createHash, randomUUID } from 'node:crypto'
import { createWriteStream, promises as fs } from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import {
	getApps,
	getExercises,
	getWorkshopFinished,
	getWorkshopInstructions,
} from './apps.server.ts'
import { getEpicVideoInfos } from './epic-api.server.ts'
import { resolvePrimaryDir } from './data-storage.server.ts'
import { getEnv } from './init-env.ts'
import { logger } from './logger.ts'

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
}

type OfflineVideoIndex = Record<string, OfflineVideoEntry>

type WorkshopVideoInfo = {
	playbackId: string
	title: string
	url: string
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

const log = logger('epic:offline-videos')
const offlineVideoDirectoryName = 'offline-videos'
const offlineVideoIndexFileName = 'index.json'

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

async function writeOfflineVideoIndex(index: OfflineVideoIndex) {
	await ensureOfflineVideoDir()
	const tmpPath = path.join(getOfflineVideoDir(), `.tmp-${randomUUID()}`)
	await fs.writeFile(tmpPath, JSON.stringify(index, null, 2), { mode: 0o600 })
	await fs.rename(tmpPath, getOfflineVideoIndexPath())
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
) {
	const entry = index[playbackId]
	if (!entry || entry.status !== 'ready') return false
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

async function downloadMuxVideo(playbackId: string, filePath: string) {
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
		await pipeline(Readable.fromWeb(response.body as any), stream)
		await fs.rename(tmpPath, filePath)
		const stat = await fs.stat(filePath)
		return { size: stat.size }
	}

	throw lastError ?? new Error(`Unable to download video ${playbackId}`)
}

async function runOfflineVideoDownloads(
	videos: Array<WorkshopVideoInfo>,
	index: OfflineVideoIndex,
) {
	for (const video of videos) {
		const updatedAt = new Date().toISOString()
		downloadState.current = {
			playbackId: video.playbackId,
			title: video.title,
		}
		downloadState.updatedAt = updatedAt

		const entry: OfflineVideoEntry = {
			playbackId: video.playbackId,
			title: video.title,
			url: video.url,
			fileName: getOfflineVideoFileName(video.playbackId),
			status: 'downloading',
			updatedAt,
		}
		index[video.playbackId] = entry
		await writeOfflineVideoIndex(index)

		try {
			const { size } = await downloadMuxVideo(
				video.playbackId,
				path.join(getOfflineVideoDir(), entry.fileName),
			)
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

	downloadState.status =
		downloadState.errors.length > 0 ? 'error' : 'completed'
	downloadState.updatedAt = new Date().toISOString()
}

export function getOfflineVideoDownloadState() {
	return downloadState
}

export async function getOfflineVideoSummary({
	request,
}: { request?: Request } = {}): Promise<OfflineVideoSummary> {
	const { videos, unavailable } = await getWorkshopVideoCollection({ request })
	const index = await readOfflineVideoIndex()
	let downloadedVideos = 0
	let totalBytes = 0

	for (const video of videos) {
		const entry = index[video.playbackId]
		if (entry?.status === 'ready') {
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

	const { videos, unavailable } = await getWorkshopVideoCollection({ request })
	const index = await readOfflineVideoIndex()
	const downloads: Array<WorkshopVideoInfo> = []
	let alreadyDownloaded = 0

	for (const video of videos) {
		if (await isOfflineVideoReady(index, video.playbackId)) {
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
		void runOfflineVideoDownloads(downloads, index).catch((error) => {
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

export async function getOfflineVideoAsset(playbackId: string) {
	const index = await readOfflineVideoIndex()
	const entry = index[playbackId]
	if (entry?.status !== 'ready') return null
	const filePath = entry.fileName
		? path.join(getOfflineVideoDir(), entry.fileName)
		: getOfflineVideoFilePath(playbackId)
	try {
		const stat = await fs.stat(filePath)
		if (stat.size === 0) return null
		return {
			filePath,
			size: stat.size,
			contentType: 'video/mp4',
		}
	} catch {
		return null
	}
}
