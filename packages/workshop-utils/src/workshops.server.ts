import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { z } from 'zod'
import { resolvePrimaryDir } from './data-storage.server.ts'

const CONFIG_FILE = 'workshops-config.json'

// Schema for the epicshop property in package.json
const EpicshopConfigSchema = z.object({
	title: z.string(),
	subtitle: z.string().optional(),
	product: z
		.object({
			host: z.string().optional(),
			slug: z.string().optional(),
			logo: z.string().optional(),
			displayName: z.string().optional(),
			displayNameShort: z.string().optional(),
		})
		.optional(),
})

export const PACKAGE_MANAGERS = ['npm', 'pnpm', 'yarn', 'bun'] as const
export type PackageManager = (typeof PACKAGE_MANAGERS)[number]

// Schema for workshop configuration (stored settings only)
const ConfigSchema = z.object({
	reposDirectory: z.string().optional(),
	preferredEditor: z.string().optional(),
})

export type Workshop = {
	name: string
	title: string
	subtitle?: string
	repoName: string
	path: string
}

export type WorkshopsConfig = z.infer<typeof ConfigSchema>

function getDefaultReposDirectory(): string {
	return path.join(os.homedir(), 'epic-workshops')
}

function resolveConfigPath(): string {
	return path.join(resolvePrimaryDir(), CONFIG_FILE)
}

async function ensureDir(dir: string) {
	try {
		await fs.mkdir(dir, { recursive: true, mode: 0o700 })
	} catch {}
	try {
		await fs.chmod(dir, 0o700)
	} catch {}
}

async function atomicWriteJSON(filePath: string, data: unknown) {
	const dir = path.dirname(filePath)
	await ensureDir(dir)
	const tmp = path.join(dir, `.tmp-${randomUUID()}`)
	await fs.writeFile(tmp, JSON.stringify(data, null, 2), { mode: 0o600 })
	await fs.rename(tmp, filePath)
}

export function getConfigPath(): string {
	return resolveConfigPath()
}

export async function loadConfig(): Promise<WorkshopsConfig> {
	const configPath = resolveConfigPath()
	try {
		const txt = await fs.readFile(configPath, 'utf8')
		const data = JSON.parse(txt)
		return ConfigSchema.parse(data)
	} catch {
		return {}
	}
}

export async function saveConfig(config: WorkshopsConfig): Promise<void> {
	const configPath = resolveConfigPath()
	await atomicWriteJSON(configPath, config)
}

export async function deleteConfig(): Promise<void> {
	const configPath = resolveConfigPath()
	try {
		await fs.unlink(configPath)
	} catch {
		// File doesn't exist, which is fine
	}
}

export async function getReposDirectory(): Promise<string> {
	const config = await loadConfig()
	return config.reposDirectory || getDefaultReposDirectory()
}

export async function isReposDirectoryConfigured(): Promise<boolean> {
	const config = await loadConfig()
	return Boolean(config.reposDirectory)
}

export function getDefaultReposDir(): string {
	return getDefaultReposDirectory()
}

export async function setReposDirectory(directory: string): Promise<void> {
	const config = await loadConfig()
	config.reposDirectory = path.resolve(directory)
	await saveConfig(config)
}

export async function getPreferredEditor(): Promise<string | undefined> {
	const config = await loadConfig()
	return config.preferredEditor
}

export async function setPreferredEditor(editor: string): Promise<void> {
	const config = await loadConfig()
	config.preferredEditor = editor
	await saveConfig(config)
}

export async function clearPreferredEditor(): Promise<void> {
	const config = await loadConfig()
	delete config.preferredEditor
	await saveConfig(config)
}

export type ReposDirectoryStatus =
	| { accessible: true }
	| { accessible: false; error: string; path: string }

/**
 * Verify that the configured repos directory exists and is accessible.
 * If the directory doesn't exist, attempts to create it.
 * Returns status indicating whether the directory is accessible.
 */
export async function verifyReposDirectory(): Promise<ReposDirectoryStatus> {
	const reposDir = await getReposDirectory()

	try {
		// Try to access the directory
		await fs.access(reposDir)
		return { accessible: true }
	} catch {
		// Directory doesn't exist, try to create it
		try {
			await fs.mkdir(reposDir, { recursive: true })
			return { accessible: true }
		} catch (mkdirError) {
			const errorMessage =
				mkdirError instanceof Error ? mkdirError.message : String(mkdirError)
			return {
				accessible: false,
				error: errorMessage,
				path: reposDir,
			}
		}
	}
}

/**
 * Scan a directory for workshops (directories with package.json containing "epicshop" property)
 */
export async function listWorkshops(): Promise<Workshop[]> {
	const reposDir = await getReposDirectory()

	// Check if directory exists
	try {
		await fs.access(reposDir)
	} catch {
		return []
	}

	const entries = await fs.readdir(reposDir, { withFileTypes: true })
	const workshops: Workshop[] = []

	for (const entry of entries) {
		if (!entry.isDirectory()) continue

		const workshopPath = path.join(reposDir, entry.name)
		const pkgPath = path.join(workshopPath, 'package.json')

		try {
			const pkgContent = await fs.readFile(pkgPath, 'utf8')
			const pkg = JSON.parse(pkgContent) as {
				name?: string
				epicshop?: unknown
			}

			if (pkg.epicshop) {
				const epicshopConfig = EpicshopConfigSchema.safeParse(pkg.epicshop)
				if (epicshopConfig.success) {
					workshops.push({
						name: pkg.name || entry.name,
						title: epicshopConfig.data.title,
						subtitle: epicshopConfig.data.subtitle,
						repoName: entry.name,
						path: workshopPath,
					})
				}
			}
		} catch {
			// Not a valid workshop directory, skip
		}
	}

	return workshops
}

export async function getWorkshop(
	idOrName: string,
): Promise<Workshop | undefined> {
	const workshops = await listWorkshops()
	return workshops.find(
		(w) =>
			w.name.toLowerCase() === idOrName.toLowerCase() ||
			w.repoName.toLowerCase() === idOrName.toLowerCase() ||
			w.title.toLowerCase() === idOrName.toLowerCase(),
	)
}

export async function workshopExists(repoName: string): Promise<boolean> {
	const workshops = await listWorkshops()
	return workshops.some(
		(w) => w.repoName.toLowerCase() === repoName.toLowerCase(),
	)
}

export async function getWorkshopByPath(
	workshopPath: string,
): Promise<Workshop | undefined> {
	const workshops = await listWorkshops()
	const resolvedPath = path.resolve(workshopPath)
	return workshops.find((w) => path.resolve(w.path) === resolvedPath)
}

/**
 * Check for unpushed changes in a git repository
 * Returns info about unpushed commits across all branches
 */
export async function getUnpushedChanges(repoPath: string): Promise<{
	hasUnpushed: boolean
	branches: Array<{ name: string; unpushedCount: number }>
	uncommittedChanges: boolean
	summary: string[]
}> {
	const { execSync } = await import('node:child_process')

	const result = {
		hasUnpushed: false,
		branches: [] as Array<{ name: string; unpushedCount: number }>,
		uncommittedChanges: false,
		summary: [] as string[],
	}

	try {
		// Check if it's a git repository
		execSync('git rev-parse --git-dir', {
			cwd: repoPath,
			stdio: 'pipe',
		})
	} catch {
		// Not a git repository
		return result
	}

	try {
		// Check for uncommitted changes
		const status = execSync('git status --porcelain', {
			cwd: repoPath,
			encoding: 'utf8',
		}).trim()

		if (status) {
			result.uncommittedChanges = true
			result.hasUnpushed = true
			const lines = status.split('\n')
			const modified = lines.filter(
				(l) => l.startsWith(' M') || l.startsWith('M '),
			).length
			const added = lines.filter(
				(l) => l.startsWith('A ') || l.startsWith('??'),
			).length
			const deleted = lines.filter(
				(l) => l.startsWith(' D') || l.startsWith('D '),
			).length

			const parts = []
			if (modified > 0) parts.push(`${modified} modified`)
			if (added > 0) parts.push(`${added} untracked/added`)
			if (deleted > 0) parts.push(`${deleted} deleted`)
			if (parts.length > 0) {
				result.summary.push(`Uncommitted changes: ${parts.join(', ')}`)
			}
		}

		// Get all local branches
		const branchOutput = execSync('git branch', {
			cwd: repoPath,
			encoding: 'utf8',
		}).trim()

		const branches = branchOutput
			.split('\n')
			.map((b) => b.replace(/^\*?\s*/, '').trim())
			.filter(Boolean)

		for (const branch of branches) {
			try {
				// Check if branch has an upstream
				const upstream = execSync(
					`git rev-parse --abbrev-ref ${branch}@{upstream}`,
					{
						cwd: repoPath,
						encoding: 'utf8',
						stdio: ['pipe', 'pipe', 'pipe'],
					},
				).trim()

				// Count unpushed commits
				const unpushedOutput = execSync(
					`git rev-list --count ${upstream}..${branch}`,
					{
						cwd: repoPath,
						encoding: 'utf8',
					},
				).trim()

				const unpushedCount = parseInt(unpushedOutput, 10)
				if (unpushedCount > 0) {
					result.hasUnpushed = true
					result.branches.push({ name: branch, unpushedCount })
					result.summary.push(
						`Branch "${branch}": ${unpushedCount} unpushed commit${unpushedCount > 1 ? 's' : ''}`,
					)
				}
			} catch {
				// Branch has no upstream, check if it has any commits not in any remote
				try {
					const allRemotes = execSync('git remote', {
						cwd: repoPath,
						encoding: 'utf8',
					}).trim()

					if (allRemotes) {
						// Branch exists but has no upstream tracking
						const commitCount = execSync(`git rev-list --count ${branch}`, {
							cwd: repoPath,
							encoding: 'utf8',
						}).trim()

						const count = parseInt(commitCount, 10)
						if (count > 0) {
							result.hasUnpushed = true
							result.branches.push({ name: branch, unpushedCount: count })
							result.summary.push(
								`Branch "${branch}": ${count} local commit${count > 1 ? 's' : ''} (no upstream)`,
							)
						}
					}
				} catch {
					// Ignore errors for individual branches
				}
			}
		}
	} catch {
		// Error checking git status, assume no unpushed changes
	}

	return result
}

/**
 * Delete a workshop directory
 */
export async function deleteWorkshop(workshopPath: string): Promise<void> {
	await fs.rm(workshopPath, { recursive: true, force: true })
}
