import '@epic-web/workshop-utils/init-env'

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
	resolveCacheDir,
	resolveFallbackPath,
	resolvePrimaryPath,
} from '@epic-web/workshop-utils/data-storage.server'
import {
	deleteWorkshop,
	getReposDirectory,
	getUnpushedChanges,
} from '@epic-web/workshop-utils/workshops.server'
import chalk from 'chalk'
import { assertCanPrompt } from '../utils/cli-runtime.js'

export type CleanupTarget = 'workshops' | 'caches' | 'preferences' | 'auth'

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
}

export type CleanupOptions = {
	silent?: boolean
	force?: boolean
	targets?: CleanupTarget[]
	paths?: Partial<CleanupPaths>
}

type WorkshopEntry = {
	title: string
	repoName: string
	path: string
}

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
		value: 'preferences',
		name: 'Preferences',
		description: 'Clear stored preferences and local settings',
	},
	{
		value: 'auth',
		name: 'Auth data',
		description: 'Remove stored login tokens',
	},
]

function resolveCleanupTargets(targets?: CleanupTarget[]): CleanupTarget[] {
	if (!targets || targets.length === 0) return []
	const allowed = new Set(CLEANUP_TARGETS.map((target) => target.value))
	return Array.from(new Set(targets.filter((target) => allowed.has(target))))
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
	return { reposDir, cacheDir, legacyCacheDir, dataPaths }
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

async function selectCleanupTargets(
	availableTargets: Array<(typeof CLEANUP_TARGETS)[number]>,
): Promise<CleanupTarget[]> {
	assertCanPrompt({
		reason: 'select cleanup targets',
		hints: [
			'Provide targets via: npx epicshop cleanup --targets <name>',
			'Example: npx epicshop cleanup --targets workshops --targets caches --force',
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

function formatTargetList(targets: CleanupTarget[]): string {
	const labelMap = new Map(
		CLEANUP_TARGETS.map((target) => [target.value, target.name]),
	)
	return targets.map((target) => labelMap.get(target) ?? target).join(', ')
}

/**
 * Clean up local epicshop data.
 */
export async function cleanup({
	silent = false,
	force = false,
	targets,
	paths,
}: CleanupOptions = {}): Promise<CleanupResult> {
	try {
		let selectedTargets = resolveCleanupTargets(targets)
		if (selectedTargets.length === 0) {
			selectedTargets = await selectCleanupTargets(CLEANUP_TARGETS)
		}

		if (selectedTargets.length === 0) {
			const message = 'No cleanup targets selected'
			if (!silent) console.log(chalk.gray(message))
			return { success: true, message, selectedTargets }
		}

		const { reposDir, cacheDir, legacyCacheDir, dataPaths } =
			await resolveCleanupPaths(paths)
		const workshops = selectedTargets.includes('workshops')
			? await listWorkshopsInDirectory(reposDir)
			: []
		const unpushedSummaries =
			!silent && workshops.length > 0
				? await Promise.all(
						workshops.map(async (workshop) => ({
							workshop,
							unpushedChanges: await getUnpushedChanges(workshop.path),
						})),
					)
				: []

		if (!silent) {
			console.log(chalk.yellow('This will clean up the following:'))
			if (selectedTargets.includes('workshops')) {
				console.log(
					chalk.yellow(
						`- Workshops: ${workshops.length} detected in ${reposDir}`,
					),
				)
			}
			if (selectedTargets.includes('caches')) {
				console.log(chalk.yellow(`- Caches: ${cacheDir}`))
				console.log(chalk.yellow(`- Legacy cache: ${legacyCacheDir}`))
			}
			if (selectedTargets.includes('preferences')) {
				console.log(chalk.yellow(`- Preferences: ${dataPaths.join(', ')}`))
			}
			if (selectedTargets.includes('auth')) {
				console.log(chalk.yellow(`- Auth data: ${dataPaths.join(', ')}`))
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
				message: `Proceed with cleanup of: ${formatTargetList(selectedTargets)}?`,
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

		if (selectedTargets.includes('workshops')) {
			for (const workshop of workshops) {
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
				} else {
					skippedPaths.push(reposDir)
				}
			} else {
				skippedPaths.push(reposDir)
			}
		}

		if (selectedTargets.includes('caches')) {
			await removePath(cacheDir, removedPaths, skippedPaths, failures)
			await removePath(legacyCacheDir, removedPaths, skippedPaths, failures)
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
