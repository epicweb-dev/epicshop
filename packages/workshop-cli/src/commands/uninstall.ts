import '@epic-web/workshop-utils/init-env'

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
	resolveCacheDir,
	resolveFallbackPath,
	resolvePrimaryDir,
} from '@epic-web/workshop-utils/data-storage.server'
import {
	deleteWorkshop,
	getReposDirectory,
	getUnpushedChanges,
} from '@epic-web/workshop-utils/workshops.server'
import chalk from 'chalk'
import { assertCanPrompt } from '../utils/cli-runtime.js'

export type UninstallResult = {
	success: boolean
	message?: string
	error?: Error
	removedPaths?: string[]
	skippedPaths?: string[]
}

type UninstallPaths = {
	reposDir: string
	primaryDir: string
	cacheDir: string
	legacyDir: string
	fallbackDir: string
}

export type UninstallOptions = {
	silent?: boolean
	force?: boolean
	paths?: Partial<UninstallPaths>
}

type WorkshopEntry = {
	title: string
	repoName: string
	path: string
}

async function resolveUninstallPaths(
	paths: Partial<UninstallPaths> = {},
): Promise<UninstallPaths> {
	const reposDir = paths.reposDir ?? (await getReposDirectory())
	const primaryDir = paths.primaryDir ?? resolvePrimaryDir()
	const cacheDir = paths.cacheDir ?? resolveCacheDir()
	const legacyDir = paths.legacyDir ?? path.join(os.homedir(), '.epicshop')
	const fallbackDir = paths.fallbackDir ?? path.dirname(resolveFallbackPath())
	return { reposDir, primaryDir, cacheDir, legacyDir, fallbackDir }
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

/**
 * Remove local epicshop workshops, data, and caches.
 */
export async function uninstall({
	silent = false,
	force = false,
	paths,
}: UninstallOptions = {}): Promise<UninstallResult> {
	try {
		const { reposDir, primaryDir, cacheDir, legacyDir, fallbackDir } =
			await resolveUninstallPaths(paths)
		const workshops = await listWorkshopsInDirectory(reposDir)

		const unpushedSummaries = await Promise.all(
			workshops.map(async (workshop) => {
				const unpushedChanges = await getUnpushedChanges(workshop.path)
				return { workshop, unpushedChanges }
			}),
		)

		if (!silent) {
			console.log(chalk.yellow('This will remove local epicshop data:'))
			console.log(chalk.yellow(`- Workshops directory: ${reposDir}`))
			console.log(
				chalk.yellow(
					`  - ${workshops.length} workshop(s) detected for removal`,
				),
			)
			console.log(chalk.yellow(`- State directory: ${primaryDir}`))
			console.log(chalk.yellow(`- Cache directory: ${cacheDir}`))
			console.log(chalk.yellow(`- Temp data directory: ${fallbackDir}`))
			console.log(chalk.yellow(`- Legacy directory: ${legacyDir}`))

			const unpushedReports = unpushedSummaries.filter(
				(item) => item.unpushedChanges.hasUnpushed,
			)
			if (unpushedReports.length > 0) {
				console.log()
				console.log(
					chalk.yellow(
						'Warning: unpushed workshop changes detected. Review before deleting:',
					),
				)
				for (const report of unpushedReports) {
					const workshop = report.workshop
					const unpushedChanges = report.unpushedChanges
					console.log(chalk.yellow(`- ${workshop.title} (${workshop.path})`))
					for (const line of unpushedChanges.summary) {
						console.log(chalk.yellow(`  - ${line}`))
					}
				}
			}
		}

		if (!force) {
			assertCanPrompt({
				reason: 'confirm uninstall',
				hints: ['Run non-interactively with: npx epicshop uninstall --force'],
			})
			const { confirm } = await import('@inquirer/prompts')
			const shouldDelete = await confirm({
				message: 'Uninstall epicshop and delete local data?',
				default: false,
			})

			if (!shouldDelete) {
				const message = 'Uninstall cancelled'
				if (!silent) console.log(chalk.gray(message))
				return { success: false, message }
			}
		}

		const removedPaths: string[] = []
		const skippedPaths: string[] = []
		const failures: Array<{ path: string; error: Error }> = []

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

		const supportPaths = Array.from(
			new Set([primaryDir, cacheDir, fallbackDir, legacyDir]),
		)

		for (const targetPath of supportPaths) {
			await removePath(targetPath, removedPaths, skippedPaths, failures)
		}

		if (failures.length > 0) {
			const message = `Failed to remove ${failures.length} path(s).`
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
				skippedPaths,
			}
		}

		const message = `Uninstall complete. Removed ${removedPaths.length} path(s).`
		if (!silent) {
			console.log(chalk.green(message))
			if (skippedPaths.length > 0) {
				console.log(
					chalk.gray(
						`Skipped ${skippedPaths.length} path(s) that did not exist or were not empty.`,
					),
				)
			}
		}

		return { success: true, message, removedPaths, skippedPaths }
	} catch (error) {
		if ((error as Error).message === 'USER_QUIT') {
			throw error
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
