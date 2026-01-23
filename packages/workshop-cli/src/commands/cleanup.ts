import '@epic-web/workshop-utils/init-env'

import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
	resolveCacheDir,
	resolveFallbackPath,
	resolvePrimaryDir,
	resolvePrimaryPath,
} from '@epic-web/workshop-utils/data-storage.server'
import {
	deleteWorkshop,
	getConfigPath,
	getReposDirectory,
	getUnpushedChanges,
} from '@epic-web/workshop-utils/workshops.server'
import chalk from 'chalk'
import ora from 'ora'
import { assertCanPrompt } from '../utils/cli-runtime.js'

export type CleanupTarget =
	| 'workshops'
	| 'caches'
	| 'offline-videos'
	| 'preferences'
	| 'auth'
	| 'config'

export type WorkshopCleanupTarget = 'files' | 'caches' | 'offline-videos'

export type CleanupResult = {
	success: boolean
	message?: string
	error?: Error
	removedPaths?: string[]
	updatedPaths?: string[]
	skippedPaths?: string[]
	selectedTargets?: CleanupTarget[]
}

type CleanupPaths = {
	reposDir: string
	cacheDir: string
	legacyCacheDir: string
	dataPaths: string[]
	offlineVideosDir: string
	configPath: string
}

export type CleanupOptions = {
	silent?: boolean
	force?: boolean
	targets?: CleanupTarget[]
	workshops?: string[]
	workshopTargets?: WorkshopCleanupTarget[]
	paths?: Partial<CleanupPaths>
}

type WorkshopEntry = {
	title: string
	repoName: string
	path: string
}

type Spinner = ReturnType<typeof ora>

const CLEANUP_TARGETS: Array<{
	value: CleanupTarget
	name: string
	description: string
}> = [
	{
		value: 'workshops',
		name: 'Workshops',
		description: 'Delete locally installed workshop directories',
	},
	{
		value: 'caches',
		name: 'Caches',
		description: 'Remove local cache directories (apps, diffs, GitHub)',
	},
	{
		value: 'offline-videos',
		name: 'Offline videos',
		description: 'Delete downloaded offline videos',
	},
	{
		value: 'preferences',
		name: 'Preferences',
		description: 'Clear stored preferences and local settings',
	},
	{
		value: 'config',
		name: 'CLI config',
		description: 'Remove saved CLI config (workshops directory setting)',
	},
	{
		value: 'auth',
		name: 'Auth data',
		description: 'Remove stored login tokens',
	},
]

const WORKSHOP_CLEANUP_TARGETS: Array<{
	value: WorkshopCleanupTarget
	name: string
	description: string
}> = [
	{
		value: 'files',
		name: 'Workshop files',
		description: 'Delete the workshop directory',
	},
	{
		value: 'caches',
		name: 'Workshop caches',
		description: 'Remove caches for selected workshops',
	},
	{
		value: 'offline-videos',
		name: 'Offline videos',
		description: 'Delete offline videos for selected workshops',
	},
]

function resolveCleanupTargets(targets?: CleanupTarget[]): CleanupTarget[] {
	if (!targets || targets.length === 0) return []
	const allowed = new Set(CLEANUP_TARGETS.map((target) => target.value))
	return Array.from(new Set(targets.filter((target) => allowed.has(target))))
}

function resolveWorkshopCleanupTargets(
	targets?: WorkshopCleanupTarget[],
): WorkshopCleanupTarget[] {
	if (!targets || targets.length === 0) return []
	const allowed = new Set(
		WORKSHOP_CLEANUP_TARGETS.map((target) => target.value),
	)
	return Array.from(new Set(targets.filter((target) => allowed.has(target))))
}

function startSpinner(text: string, silent: boolean): Spinner | null {
	if (silent) return null
	return ora(text).start()
}

function updateSpinner(spinner: Spinner | null, text: string) {
	if (spinner) spinner.text = text
}

function stopSpinner(spinner: Spinner | null) {
	if (spinner?.isSpinning) spinner.stop()
}

async function resolveCleanupPaths(
	paths: Partial<CleanupPaths> = {},
): Promise<CleanupPaths> {
	const reposDir = paths.reposDir ?? (await getReposDirectory())
	const cacheDir = paths.cacheDir ?? resolveCacheDir()
	const legacyCacheDir =
		paths.legacyCacheDir ?? path.join(os.homedir(), '.epicshop', 'cache')
	const dataPaths = paths.dataPaths ?? [
		resolvePrimaryPath(),
		resolveFallbackPath(),
	]
	const offlineVideosDir =
		paths.offlineVideosDir ?? path.join(resolvePrimaryDir(), 'offline-videos')
	const configPath = paths.configPath ?? getConfigPath()
	return {
		reposDir,
		cacheDir,
		legacyCacheDir,
		dataPaths,
		offlineVideosDir,
		configPath,
	}
}

async function pathExists(targetPath: string): Promise<boolean> {
	try {
		await fs.access(targetPath)
		return true
	} catch {
		return false
	}
}

async function isDirectoryEmpty(targetPath: string): Promise<boolean> {
	try {
		const entries = await fs.readdir(targetPath)
		return entries.length === 0
	} catch {
		return false
	}
}

async function listWorkshopsInDirectory(
	reposDir: string,
): Promise<WorkshopEntry[]> {
	try {
		const entries = await fs.readdir(reposDir, { withFileTypes: true })
		const workshops: WorkshopEntry[] = []

		for (const entry of entries) {
			if (!entry.isDirectory()) continue
			const workshopPath = path.join(reposDir, entry.name)
			const packageJsonPath = path.join(workshopPath, 'package.json')

			try {
				const packageJson = JSON.parse(
					await fs.readFile(packageJsonPath, 'utf8'),
				) as {
					name?: string
					epicshop?: { title?: string }
				}
				if (packageJson.epicshop) {
					workshops.push({
						title: packageJson.epicshop.title || packageJson.name || entry.name,
						repoName: entry.name,
						path: workshopPath,
					})
				}
			} catch {
				// Not a valid workshop directory, skip.
			}
		}

		return workshops
	} catch {
		return []
	}
}

async function removePath(
	targetPath: string,
	removedPaths: string[],
	skippedPaths: string[],
	failures: Array<{ path: string; error: Error }>,
) {
	const exists = await pathExists(targetPath)
	if (!exists) {
		skippedPaths.push(targetPath)
		return
	}
	try {
		await fs.rm(targetPath, { recursive: true, force: true })
		removedPaths.push(targetPath)
	} catch (error) {
		failures.push({
			path: targetPath,
			error: error instanceof Error ? error : new Error(String(error)),
		})
	}
}

function formatBytes(bytes: number): string {
	if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
	const units = ['B', 'KB', 'MB', 'GB', 'TB']
	let size = bytes
	let unitIndex = 0
	while (size >= 1024 && unitIndex < units.length - 1) {
		size /= 1024
		unitIndex += 1
	}
	const formatted =
		size >= 10 || unitIndex === 0 ? Math.round(size) : size.toFixed(1)
	return `${formatted} ${units[unitIndex]}`
}

async function getPathSize(targetPath: string): Promise<number> {
	try {
		const stats = await fs.lstat(targetPath)
		if (stats.isSymbolicLink()) return 0
		if (stats.isFile()) return stats.size
		if (!stats.isDirectory()) return 0
		const entries = await fs.readdir(targetPath, { withFileTypes: true })
		let total = 0
		for (const entry of entries) {
			const entryPath = path.join(targetPath, entry.name)
			if (entry.isSymbolicLink()) continue
			if (entry.isFile()) {
				try {
					const entryStats = await fs.lstat(entryPath)
					total += entryStats.size
				} catch {
					// ignore unreadable files
				}
			} else if (entry.isDirectory()) {
				total += await getPathSize(entryPath)
			}
		}
		return total
	} catch {
		return 0
	}
}

function getWorkshopInstanceId(workshopPath: string): string {
	return createHash('md5').update(path.resolve(workshopPath)).digest('hex')
}

type OfflineVideoIndexEntry = {
	playbackId: string
	title?: string
	fileName?: string
	status?: string
	size?: number
	updatedAt?: string
	workshops?: Array<{ id: string; title?: string }>
}

type OfflineVideoIndex = Record<string, OfflineVideoIndexEntry>

function getOfflineVideoIndexPath(offlineVideosDir: string) {
	return path.join(offlineVideosDir, 'index.json')
}

function getOfflineVideoFilePath(
	offlineVideosDir: string,
	playbackId: string,
	fileName?: string,
) {
	if (fileName) return path.join(offlineVideosDir, fileName)
	const hash = createHash('sha256').update(playbackId).digest('hex')
	return path.join(offlineVideosDir, `${hash}.mp4`)
}

async function readOfflineVideoIndex(
	offlineVideosDir: string,
): Promise<OfflineVideoIndex> {
	try {
		const raw = await fs.readFile(
			getOfflineVideoIndexPath(offlineVideosDir),
			'utf8',
		)
		const parsed = JSON.parse(raw)
		return (
			typeof parsed === 'object' && parsed ? parsed : {}
		) as OfflineVideoIndex
	} catch {
		return {} as OfflineVideoIndex
	}
}

async function writeOfflineVideoIndex(
	offlineVideosDir: string,
	index: OfflineVideoIndex,
) {
	await fs.mkdir(offlineVideosDir, { recursive: true, mode: 0o700 })
	await fs.writeFile(
		getOfflineVideoIndexPath(offlineVideosDir),
		JSON.stringify(index, null, 2),
		{ mode: 0o600 },
	)
}

function getEntryWorkshops(entry: OfflineVideoIndexEntry) {
	return Array.isArray(entry.workshops)
		? entry.workshops.filter((workshop) => typeof workshop?.id === 'string')
		: []
}

async function getOfflineVideoEntrySize(
	offlineVideosDir: string,
	entry: OfflineVideoIndexEntry,
): Promise<number> {
	if (typeof entry.size === 'number') return entry.size
	const filePath = getOfflineVideoFilePath(
		offlineVideosDir,
		entry.playbackId,
		entry.fileName,
	)
	try {
		const stats = await fs.stat(filePath)
		return stats.size
	} catch {
		return 0
	}
}

async function estimateOfflineVideoBytesForWorkshops(
	offlineVideosDir: string,
	index: OfflineVideoIndex,
	workshopIds: Set<string>,
): Promise<number> {
	let total = 0
	for (const entry of Object.values(index)) {
		const entryWorkshops = getEntryWorkshops(entry).map(
			(workshop) => workshop.id,
		)
		if (entryWorkshops.length === 0) continue
		const hasSelected = entryWorkshops.some((id) => workshopIds.has(id))
		if (!hasSelected) continue
		const remaining = entryWorkshops.filter((id) => !workshopIds.has(id))
		if (remaining.length > 0) continue
		total += await getOfflineVideoEntrySize(offlineVideosDir, entry)
	}
	return total
}

async function deleteOfflineVideosForWorkshopIds({
	offlineVideosDir,
	index,
	workshopIds,
	removedPaths,
	skippedPaths,
	failures,
}: {
	offlineVideosDir: string
	index: OfflineVideoIndex
	workshopIds: Set<string>
	removedPaths: string[]
	skippedPaths: string[]
	failures: Array<{ path: string; error: Error }>
}) {
	let updated = false
	for (const [playbackId, entry] of Object.entries(index)) {
		const entryWorkshops = getEntryWorkshops(entry)
		if (entryWorkshops.length === 0) continue
		const hasSelected = entryWorkshops.some((workshop) =>
			workshopIds.has(workshop.id),
		)
		if (!hasSelected) continue
		const remaining = entryWorkshops.filter(
			(workshop) => !workshopIds.has(workshop.id),
		)
		if (remaining.length > 0) {
			index[playbackId] = { ...entry, workshops: remaining }
			updated = true
			continue
		}
		const filePath = getOfflineVideoFilePath(
			offlineVideosDir,
			entry.playbackId,
			entry.fileName,
		)
		delete index[playbackId]
		updated = true
		try {
			await fs.rm(filePath, { force: true })
			removedPaths.push(filePath)
		} catch (error) {
			failures.push({
				path: filePath,
				error: error instanceof Error ? error : new Error(String(error)),
			})
		}
	}
	if (updated) {
		try {
			await writeOfflineVideoIndex(offlineVideosDir, index)
		} catch (error) {
			failures.push({
				path: getOfflineVideoIndexPath(offlineVideosDir),
				error: error instanceof Error ? error : new Error(String(error)),
			})
		}
	} else {
		skippedPaths.push(getOfflineVideoIndexPath(offlineVideosDir))
	}
}

async function writeJsonFile(filePath: string, data: unknown) {
	const dir = path.dirname(filePath)
	await fs.mkdir(dir, { recursive: true, mode: 0o700 })
	await fs.writeFile(filePath, JSON.stringify(data, null, 2), { mode: 0o600 })
}

async function cleanupDataFiles({
	dataPaths,
	removePreferences,
	removeAuth,
	removedPaths,
	updatedPaths,
	skippedPaths,
	failures,
}: {
	dataPaths: string[]
	removePreferences: boolean
	removeAuth: boolean
	removedPaths: string[]
	updatedPaths: string[]
	skippedPaths: string[]
	failures: Array<{ path: string; error: Error }>
}) {
	for (const dataPath of dataPaths) {
		const exists = await pathExists(dataPath)
		const backupPath = `${dataPath}.bkp`
		if (!exists) {
			skippedPaths.push(dataPath)
			await removePath(backupPath, removedPaths, skippedPaths, failures)
			continue
		}

		try {
			const raw = await fs.readFile(dataPath, 'utf8')
			const data = JSON.parse(raw) as Record<string, unknown>
			const next = { ...data }
			let changed = false

			if (removePreferences) {
				if ('preferences' in next) {
					delete next.preferences
					changed = true
				}
				if ('mutedNotifications' in next) {
					delete next.mutedNotifications
					changed = true
				}
			}

			if (removeAuth) {
				if ('authInfo' in next) {
					delete next.authInfo
					changed = true
				}
				if ('authInfos' in next) {
					delete next.authInfos
					changed = true
				}
			}

			if (!changed) {
				skippedPaths.push(dataPath)
				await removePath(backupPath, removedPaths, skippedPaths, failures)
				continue
			}

			if (Object.keys(next).length === 0) {
				await fs.rm(dataPath, { force: true })
				removedPaths.push(dataPath)
				await removePath(backupPath, removedPaths, skippedPaths, failures)
				continue
			}

			await writeJsonFile(dataPath, next)
			updatedPaths.push(dataPath)
			await removePath(backupPath, removedPaths, skippedPaths, failures)
		} catch (error) {
			failures.push({
				path: dataPath,
				error: error instanceof Error ? error : new Error(String(error)),
			})
		}
	}
}

async function getDataCleanupSizeSummary(dataPaths: string[]) {
	let preferencesBytes = 0
	let authBytes = 0
	for (const dataPath of dataPaths) {
		try {
			const raw = await fs.readFile(dataPath, 'utf8')
			const originalBytes = Buffer.byteLength(raw)
			const data = JSON.parse(raw) as Record<string, unknown>

			const prefs = { ...data }
			let prefsChanged = false
			if ('preferences' in prefs) {
				delete prefs.preferences
				prefsChanged = true
			}
			if ('mutedNotifications' in prefs) {
				delete prefs.mutedNotifications
				prefsChanged = true
			}

			if (prefsChanged) {
				if (Object.keys(prefs).length === 0) {
					preferencesBytes += originalBytes
				} else {
					const nextBytes = Buffer.byteLength(JSON.stringify(prefs, null, 2))
					preferencesBytes += Math.max(0, originalBytes - nextBytes)
				}
			}

			const authData = { ...data }
			let authChanged = false
			if ('authInfo' in authData) {
				delete authData.authInfo
				authChanged = true
			}
			if ('authInfos' in authData) {
				delete authData.authInfos
				authChanged = true
			}

			if (authChanged) {
				if (Object.keys(authData).length === 0) {
					authBytes += originalBytes
				} else {
					const nextBytes = Buffer.byteLength(JSON.stringify(authData, null, 2))
					authBytes += Math.max(0, originalBytes - nextBytes)
				}
			}
		} catch {
			// ignore unreadable data files
		}
	}
	return { preferencesBytes, authBytes }
}

type WorkshopSummary = WorkshopEntry & {
	id: string
	sizeBytes: number
	cacheBytes: number
}

type WorkshopSummaryProgress = {
	current: number
	total: number
	workshop: WorkshopEntry
}

async function getWorkshopSummaries({
	workshops,
	cacheDir,
	onProgress,
}: {
	workshops: WorkshopEntry[]
	cacheDir: string
	onProgress?: (progress: WorkshopSummaryProgress) => void
}): Promise<WorkshopSummary[]> {
	const summaries: WorkshopSummary[] = []
	const total = workshops.length
	for (const [index, workshop] of workshops.entries()) {
		onProgress?.({ current: index + 1, total, workshop })
		const id = getWorkshopInstanceId(workshop.path)
		const sizeBytes = await getPathSize(workshop.path)
		const cacheBytes = await getPathSize(path.join(cacheDir, id))
		summaries.push({
			...workshop,
			id,
			sizeBytes,
			cacheBytes,
		})
	}
	return summaries
}

async function selectWorkshops(workshops: WorkshopSummary[]) {
	assertCanPrompt({
		reason: 'select workshops to clean up',
		hints: ['Provide workshops via: npx epicshop cleanup --workshops <name>'],
	})
	const { checkbox } = await import('@inquirer/prompts')
	console.log(
		chalk.gray('\n   Use space to select, enter to confirm your selection.\n'),
	)
	return checkbox({
		message: 'Select workshops to clean up:',
		choices: workshops.map((workshop) => ({
			name: `${workshop.title} (${workshop.repoName})`,
			value: workshop.id,
			description: `${workshop.path} • ${formatBytes(workshop.sizeBytes)}`,
		})),
	})
}

function matchesWorkshopInput(
	workshop: WorkshopSummary,
	input: string,
): boolean {
	const normalized = input.trim().toLowerCase()
	if (!normalized) return false
	const candidates = [
		workshop.repoName,
		workshop.title,
		workshop.path,
		path.basename(workshop.path),
	].map((value) => value.toLowerCase())
	if (candidates.includes(normalized)) return true
	const resolvedInput = expandTilde(normalized)
	if (resolvedInput.includes(path.sep)) {
		return (
			path.resolve(workshop.path).toLowerCase() ===
			path.resolve(resolvedInput).toLowerCase()
		)
	}
	return false
}

function expandTilde(inputPath: string): string {
	if (inputPath === '~') return os.homedir()
	if (inputPath.startsWith('~/') || inputPath.startsWith('~\\')) {
		return path.join(os.homedir(), inputPath.slice(2))
	}
	return inputPath
}

function resolveWorkshopSelection(
	workshops: WorkshopSummary[],
	requested: string[],
): { selected: WorkshopSummary[]; missing: string[] } {
	const selected = new Map<string, WorkshopSummary>()
	const missing: string[] = []
	for (const entry of requested) {
		const match = workshops.find((workshop) =>
			matchesWorkshopInput(workshop, entry),
		)
		if (match) {
			selected.set(match.id, match)
		} else {
			missing.push(entry)
		}
	}
	return { selected: Array.from(selected.values()), missing }
}

async function selectWorkshopTargets(
	choices: Array<{
		value: WorkshopCleanupTarget
		name: string
		description: string
	}>,
) {
	assertCanPrompt({
		reason: 'select what to clean for the selected workshops',
		hints: [
			'Provide selections via: npx epicshop cleanup --workshop-actions <name>',
		],
	})
	const { checkbox } = await import('@inquirer/prompts')
	console.log(
		chalk.gray('\n   Use space to select, enter to confirm your selection.\n'),
	)
	return checkbox({
		message: 'Select what to clean for the selected workshops:',
		choices,
	})
}

async function selectCleanupTargets(
	availableTargets: Array<{
		value: CleanupTarget
		name: string
		description: string
	}>,
): Promise<CleanupTarget[]> {
	assertCanPrompt({
		reason: 'select cleanup targets',
		hints: [
			'Provide targets via: npx epicshop cleanup --targets <name>',
			'Example: npx epicshop cleanup --targets caches --targets offline-videos --force',
		],
	})
	const { checkbox } = await import('@inquirer/prompts')

	console.log(
		chalk.gray('\n   Use space to select, enter to confirm your selection.\n'),
	)

	return checkbox({
		message: 'Select what to clean up:',
		choices: availableTargets.map((target) => ({
			name: target.name,
			value: target.value,
			description: target.description,
		})),
	})
}

/**
 * Clean up local epicshop data.
 */
export async function cleanup({
	silent = false,
	force = false,
	targets,
	workshops,
	workshopTargets,
	paths,
}: CleanupOptions = {}): Promise<CleanupResult> {
	try {
		let selectedTargets = resolveCleanupTargets(targets)
		let selectedWorkshopTargets = resolveWorkshopCleanupTargets(workshopTargets)
		if ((workshops?.length ?? 0) > 0 || selectedWorkshopTargets.length > 0) {
			if (!selectedTargets.includes('workshops')) {
				selectedTargets.push('workshops')
			}
		}

		const analysisSpinner = startSpinner(
			'Scanning local epicshop data...',
			silent,
		)
		let reposDir = ''
		let cacheDir = ''
		let legacyCacheDir = ''
		let dataPaths: string[] = []
		let offlineVideosDir = ''
		let configPath = ''
		let workshopSummaries: WorkshopSummary[] = []
		let workshopBytes = 0
		let legacyCacheBytes = 0
		let cacheBytes = 0
		let offlineVideosBytes = 0
		let preferencesBytes = 0
		let authBytes = 0
		let configBytes = 0

		try {
			updateSpinner(analysisSpinner, 'Resolving cleanup locations...')
			;({
				reposDir,
				cacheDir,
				legacyCacheDir,
				dataPaths,
				offlineVideosDir,
				configPath,
			} = await resolveCleanupPaths(paths))
			updateSpinner(analysisSpinner, 'Finding installed workshops...')
			const allWorkshops = await listWorkshopsInDirectory(reposDir)
			updateSpinner(analysisSpinner, 'Calculating workshop sizes...')
			workshopSummaries = await getWorkshopSummaries({
				workshops: allWorkshops,
				cacheDir,
				onProgress: (progress) => {
					updateSpinner(
						analysisSpinner,
						`Calculating workshop sizes (${progress.current}/${progress.total}): ${progress.workshop.repoName}`,
					)
				},
			})
			workshopBytes = workshopSummaries.reduce(
				(total, workshop) => total + workshop.sizeBytes,
				0,
			)
			updateSpinner(analysisSpinner, 'Calculating cache sizes...')
			legacyCacheBytes = await getPathSize(legacyCacheDir)
			const cacheDirBytes = await getPathSize(cacheDir)
			cacheBytes = cacheDirBytes + legacyCacheBytes
			updateSpinner(analysisSpinner, 'Calculating offline video sizes...')
			offlineVideosBytes = await getPathSize(offlineVideosDir)
			updateSpinner(analysisSpinner, 'Calculating CLI config size...')
			configBytes = await getPathSize(configPath)
			updateSpinner(analysisSpinner, 'Scanning preferences and auth data...')
			;({ preferencesBytes, authBytes } =
				await getDataCleanupSizeSummary(dataPaths))
		} finally {
			stopSpinner(analysisSpinner)
		}

		const cleanupChoices = CLEANUP_TARGETS.map((target) => {
			const sizeByTarget: Record<CleanupTarget, number> = {
				workshops: workshopBytes,
				caches: cacheBytes,
				'offline-videos': offlineVideosBytes,
				preferences: preferencesBytes,
				auth: authBytes,
				config: configBytes,
			}
			return {
				...target,
				description: `${target.description} (${formatBytes(
					sizeByTarget[target.value],
				)})`,
			}
		})

		if (selectedTargets.length === 0) {
			selectedTargets = await selectCleanupTargets(cleanupChoices)
		}

		if (selectedTargets.length === 0) {
			const message = 'No cleanup targets selected'
			if (!silent) console.log(chalk.gray(message))
			return { success: true, message, selectedTargets }
		}

		let selectedWorkshops: WorkshopSummary[] = []
		if (selectedTargets.includes('workshops')) {
			if (workshopSummaries.length === 0) {
				if (!silent) {
					console.log(chalk.yellow('No workshops found to clean up.'))
				}
			} else if (workshops && workshops.length > 0) {
				const resolved = resolveWorkshopSelection(workshopSummaries, workshops)
				if (resolved.missing.length > 0) {
					return {
						success: false,
						message: `Workshops not found: ${resolved.missing.join(', ')}`,
						selectedTargets,
					}
				}
				selectedWorkshops = resolved.selected
			} else {
				const selectedIds = await selectWorkshops(workshopSummaries)
				selectedWorkshops = workshopSummaries.filter((workshop) =>
					selectedIds.includes(workshop.id),
				)
			}

			if (
				selectedWorkshops.length > 0 &&
				selectedWorkshopTargets.length === 0
			) {
				const selectedWorkshopIds = new Set(
					selectedWorkshops.map((workshop) => workshop.id),
				)
				const workshopFileBytes = selectedWorkshops.reduce(
					(total, workshop) => total + workshop.sizeBytes,
					0,
				)
				const workshopCacheBytes = selectedWorkshops.reduce(
					(total, workshop) => total + workshop.cacheBytes,
					0,
				)
				const selectionSpinner = startSpinner(
					'Calculating workshop cleanup sizes...',
					silent,
				)
				let workshopOfflineBytes = 0
				try {
					updateSpinner(selectionSpinner, 'Loading offline video index...')
					const offlineVideoIndex =
						await readOfflineVideoIndex(offlineVideosDir)
					updateSpinner(
						selectionSpinner,
						'Calculating workshop offline video sizes...',
					)
					workshopOfflineBytes = await estimateOfflineVideoBytesForWorkshops(
						offlineVideosDir,
						offlineVideoIndex,
						selectedWorkshopIds,
					)
				} finally {
					stopSpinner(selectionSpinner)
				}
				const workshopChoices = WORKSHOP_CLEANUP_TARGETS.map((target) => {
					const sizeByTarget: Record<WorkshopCleanupTarget, number> = {
						files: workshopFileBytes,
						caches: workshopCacheBytes,
						'offline-videos': workshopOfflineBytes,
					}
					return {
						...target,
						description: `${target.description} (${formatBytes(
							sizeByTarget[target.value],
						)})`,
					}
				})
				selectedWorkshopTargets = await selectWorkshopTargets(workshopChoices)
			}

			if (selectedWorkshops.length === 0) {
				selectedWorkshopTargets = []
			}
		}

		const selectedWorkshopIds = new Set(
			selectedWorkshops.map((workshop) => workshop.id),
		)
		const workshopFileBytes = selectedWorkshops.reduce(
			(total, workshop) => total + workshop.sizeBytes,
			0,
		)
		const workshopCacheBytes = selectedWorkshops.reduce(
			(total, workshop) => total + workshop.cacheBytes,
			0,
		)
		const emptyOfflineVideoIndex: OfflineVideoIndex = {}
		const offlineVideoIndex =
			selectedWorkshopTargets.includes('offline-videos') ||
			selectedTargets.includes('offline-videos')
				? await readOfflineVideoIndex(offlineVideosDir)
				: emptyOfflineVideoIndex
		const workshopOfflineBytes = selectedWorkshopTargets.includes(
			'offline-videos',
		)
			? await estimateOfflineVideoBytesForWorkshops(
					offlineVideosDir,
					offlineVideoIndex,
					selectedWorkshopIds,
				)
			: 0

		const hasWorkshopActions = selectedWorkshopTargets.length > 0
		const hasOtherTargets = selectedTargets.some(
			(target) => target !== 'workshops',
		)
		if (!hasWorkshopActions && !hasOtherTargets) {
			const message = 'No cleanup actions selected'
			if (!silent) console.log(chalk.gray(message))
			return { success: true, message, selectedTargets }
		}

		let unpushedSummaries: Array<{
			workshop: WorkshopSummary
			unpushedChanges: Awaited<ReturnType<typeof getUnpushedChanges>>
		}> = []
		if (
			!silent &&
			selectedWorkshopTargets.includes('files') &&
			selectedWorkshops.length > 0
		) {
			const unpushedSpinner = startSpinner(
				'Checking for unpushed workshop changes...',
				silent,
			)
			try {
				unpushedSummaries = await Promise.all(
					selectedWorkshops.map(async (workshop) => ({
						workshop,
						unpushedChanges: await getUnpushedChanges(workshop.path),
					})),
				)
			} finally {
				stopSpinner(unpushedSpinner)
			}
		}

		if (!silent) {
			console.log(chalk.yellow('This will clean up the following:'))
			if (selectedWorkshopTargets.includes('files')) {
				console.log(
					chalk.yellow(
						`- Workshop files (${selectedWorkshops.length} selected): ${formatBytes(
							workshopFileBytes,
						)}`,
					),
				)
			}
			if (selectedWorkshopTargets.includes('caches')) {
				console.log(
					chalk.yellow(`- Workshop caches: ${formatBytes(workshopCacheBytes)}`),
				)
			}
			if (selectedWorkshopTargets.includes('offline-videos')) {
				console.log(
					chalk.yellow(
						`- Workshop offline videos: ${formatBytes(workshopOfflineBytes)}`,
					),
				)
			}
			if (selectedTargets.includes('caches')) {
				console.log(
					chalk.yellow(`- Caches: ${formatBytes(cacheBytes)} (${cacheDir})`),
				)
				console.log(
					chalk.yellow(
						`- Legacy cache: ${formatBytes(
							legacyCacheBytes,
						)} (${legacyCacheDir})`,
					),
				)
			}
			if (selectedTargets.includes('offline-videos')) {
				console.log(
					chalk.yellow(
						`- Offline videos: ${formatBytes(
							offlineVideosBytes,
						)} (${offlineVideosDir})`,
					),
				)
			}
			if (selectedTargets.includes('preferences')) {
				console.log(
					chalk.yellow(
						`- Preferences: ${formatBytes(preferencesBytes)} (${dataPaths.join(
							', ',
						)})`,
					),
				)
			}
			if (selectedTargets.includes('config')) {
				console.log(
					chalk.yellow(
						`- CLI config: ${formatBytes(configBytes)} (${configPath})`,
					),
				)
			}
			if (selectedTargets.includes('auth')) {
				console.log(
					chalk.yellow(
						`- Auth data: ${formatBytes(authBytes)} (${dataPaths.join(', ')})`,
					),
				)
			}

			const unpushed = unpushedSummaries.filter(
				(item) => item.unpushedChanges.hasUnpushed,
			)
			if (unpushed.length > 0) {
				console.log()
				console.log(
					chalk.yellow(
						'Warning: unpushed workshop changes detected. Review before deleting:',
					),
				)
				for (const report of unpushed) {
					console.log(
						chalk.yellow(
							`- ${report.workshop.title} (${report.workshop.path})`,
						),
					)
					for (const line of report.unpushedChanges.summary) {
						console.log(chalk.yellow(`  - ${line}`))
					}
				}
			}
		}

		if (!force) {
			const confirmationItems = [
				...selectedWorkshopTargets.map((target) => {
					switch (target) {
						case 'files':
							return 'Workshop files'
						case 'caches':
							return 'Workshop caches'
						case 'offline-videos':
							return 'Workshop offline videos'
						default:
							return target
					}
				}),
				...selectedTargets
					.filter((target) => target !== 'workshops')
					.map((target) => {
						switch (target) {
							case 'offline-videos':
								return 'Offline videos'
							case 'config':
								return 'CLI config'
							default:
								return target.charAt(0).toUpperCase() + target.slice(1)
						}
					}),
			]
			assertCanPrompt({
				reason: 'confirm cleanup',
				hints: [
					`Run non-interactively with: npx epicshop cleanup --targets ${selectedTargets.join(
						' --targets ',
					)} --force`,
				],
			})
			const { confirm } = await import('@inquirer/prompts')
			const shouldProceed = await confirm({
				message: `Proceed with cleanup of: ${confirmationItems.join(', ')}?`,
				default: false,
			})

			if (!shouldProceed) {
				const message = 'Cleanup cancelled'
				if (!silent) console.log(chalk.gray(message))
				return { success: false, message, selectedTargets }
			}
		}

		const removedPaths: string[] = []
		const updatedPaths: string[] = []
		const skippedPaths: string[] = []
		const failures: Array<{ path: string; error: Error }> = []

		if (selectedWorkshopTargets.includes('files')) {
			for (const workshop of selectedWorkshops) {
				try {
					await deleteWorkshop(workshop.path)
					removedPaths.push(workshop.path)
				} catch (error) {
					failures.push({
						path: workshop.path,
						error: error instanceof Error ? error : new Error(String(error)),
					})
				}
			}

			if (await pathExists(reposDir)) {
				const isEmpty = await isDirectoryEmpty(reposDir)
				if (isEmpty) {
					await removePath(reposDir, removedPaths, skippedPaths, failures)
				} else if (selectedWorkshops.length > 0) {
					skippedPaths.push(reposDir)
				}
			} else {
				skippedPaths.push(reposDir)
			}
		}

		if (selectedWorkshopTargets.includes('caches')) {
			for (const workshop of selectedWorkshops) {
				await removePath(
					path.join(cacheDir, workshop.id),
					removedPaths,
					skippedPaths,
					failures,
				)
			}
		}

		if (selectedWorkshopTargets.includes('offline-videos')) {
			const hasOfflineVideosDir = await pathExists(offlineVideosDir)
			if (!hasOfflineVideosDir) {
				skippedPaths.push(offlineVideosDir)
			} else {
				await deleteOfflineVideosForWorkshopIds({
					offlineVideosDir,
					index: offlineVideoIndex,
					workshopIds: selectedWorkshopIds,
					removedPaths,
					skippedPaths,
					failures,
				})
			}
		}

		if (selectedTargets.includes('caches')) {
			await removePath(cacheDir, removedPaths, skippedPaths, failures)
			await removePath(legacyCacheDir, removedPaths, skippedPaths, failures)
		}

		if (selectedTargets.includes('offline-videos')) {
			await removePath(offlineVideosDir, removedPaths, skippedPaths, failures)
		}

		if (
			selectedTargets.includes('preferences') ||
			selectedTargets.includes('auth')
		) {
			await cleanupDataFiles({
				dataPaths,
				removePreferences: selectedTargets.includes('preferences'),
				removeAuth: selectedTargets.includes('auth'),
				removedPaths,
				updatedPaths,
				skippedPaths,
				failures,
			})
		}

		if (selectedTargets.includes('config')) {
			await removePath(configPath, removedPaths, skippedPaths, failures)
		}

		if (failures.length > 0) {
			const message = `Failed to clean up ${failures.length} path(s).`
			if (!silent) {
				console.error(chalk.red(message))
				for (const failure of failures) {
					console.error(
						chalk.red(`- ${failure.path}: ${failure.error.message}`),
					)
				}
			}
			return {
				success: false,
				message,
				error: new Error(
					failures.map((failure) => failure.error.message).join('; '),
				),
				removedPaths,
				updatedPaths,
				skippedPaths,
				selectedTargets,
			}
		}

		const message = `Cleanup complete. Removed ${removedPaths.length} path(s).`
		if (!silent) {
			console.log(chalk.green(message))
			if (updatedPaths.length > 0) {
				console.log(
					chalk.gray(
						`Updated ${updatedPaths.length} data file(s) with selected cleanup changes.`,
					),
				)
			}
			if (skippedPaths.length > 0) {
				console.log(
					chalk.gray(
						`Skipped ${skippedPaths.length} path(s) that did not exist or required no changes.`,
					),
				)
			}
		}

		return {
			success: true,
			message,
			removedPaths,
			updatedPaths,
			skippedPaths,
			selectedTargets,
		}
	} catch (error) {
		if ((error as Error).message === 'USER_QUIT') {
			return { success: false, message: 'User quit' }
		}
		const message = error instanceof Error ? error.message : String(error)
		if (!silent) {
			console.error(chalk.red(message))
		}
		return {
			success: false,
			message,
			error: error instanceof Error ? error : new Error(message),
		}
	}
}
