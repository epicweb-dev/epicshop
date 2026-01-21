import './init-env.ts'

import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { execa, execaCommand } from 'execa'
import { getWorkshopRoot } from './apps.server.ts'
import { cachified, checkForUpdatesCache } from './cache.server.ts'
import { getWorkshopConfig } from './config.server.ts'
import { getEnv } from './env.server.ts'
import { logger } from './logger.ts'
import { checkConnection } from './utils.server.ts'
import { getErrorMessage } from './utils.ts'

const gitLog = logger('epic:git')

function dirHasTrackedFiles(cwd: string, dirPath: string) {
	return execa('git', ['ls-files', dirPath], { cwd }).then(
		(s) => s.stdout.trim().length > 0,
		() => true,
	)
}

function isDirectory(dirPath: string) {
	return fs.stat(dirPath).then(
		(s) => s.isDirectory(),
		() => false,
	)
}

type PackageLockStatus = {
	dependenciesNeedInstall: boolean
	lockfileHash: string | null
	reason:
		| 'missing-package-lock'
		| 'missing-installed-lock'
		| 'lockfile-mismatch'
		| 'up-to-date'
}

function hashLockfile(contents: string) {
	return createHash('sha256').update(contents).digest('hex').slice(0, 8)
}

async function readFileIfExists(filePath: string) {
	try {
		return await fs.readFile(filePath, 'utf8')
	} catch {
		return null
	}
}

async function getPackageLockStatus(cwd: string): Promise<PackageLockStatus> {
	const packageLockPath = path.join(cwd, 'package-lock.json')
	const packageLockContents = await readFileIfExists(packageLockPath)
	if (!packageLockContents) {
		return {
			dependenciesNeedInstall: false,
			lockfileHash: null,
			reason: 'missing-package-lock',
		}
	}

	const lockfileHash = hashLockfile(packageLockContents)
	const installedLockPath = path.join(cwd, 'node_modules', '.package-lock.json')
	const installedLockContents = await readFileIfExists(installedLockPath)

	if (!installedLockContents) {
		return {
			dependenciesNeedInstall: true,
			lockfileHash,
			reason: 'missing-installed-lock',
		}
	}

	// Parse both lockfiles to compare only the installed packages
	try {
		const mainLockfile = JSON.parse(packageLockContents) as {
			packages: Record<string, unknown>
		}
		const installedLockfile = JSON.parse(installedLockContents) as {
			packages: Record<string, unknown>
		}

		// Extract packages from both, excluding the root package ("") from main lockfile
		const mainPackages: Record<string, unknown> = { ...mainLockfile.packages }
		delete mainPackages['']

		const installedPackages: Record<string, unknown> = installedLockfile.packages

		// Compare by hashing the normalized package data
		const mainPackagesHash = hashLockfile(JSON.stringify(mainPackages))
		const installedPackagesHash = hashLockfile(JSON.stringify(installedPackages))

		if (mainPackagesHash !== installedPackagesHash) {
			return {
				dependenciesNeedInstall: true,
				lockfileHash,
				reason: 'lockfile-mismatch',
			}
		}
	} catch {
		// If parsing fails, fall back to simple comparison (which will likely show mismatch)
		const installedHash = hashLockfile(installedLockContents)
		if (installedHash !== lockfileHash) {
			return {
				dependenciesNeedInstall: true,
				lockfileHash,
				reason: 'lockfile-mismatch',
			}
		}
	}

	return {
		dependenciesNeedInstall: false,
		lockfileHash,
		reason: 'up-to-date',
	}
}

function getDependencyNotificationId(lockfileHash: string | null) {
	if (!lockfileHash) return null
	return `update-deps-${lockfileHash}`
}

async function cleanupEmptyExerciseDirectories(cwd: string) {
	console.log('🧹 Cleaning up empty exercise directories...')
	try {
		const exercisesDirPath = path.join(cwd, 'exercises')
		const exercisesDirs = (await fs.readdir(exercisesDirPath)).sort()
		for (const exerciseDir of exercisesDirs) {
			const exerciseDirPath = path.join(exercisesDirPath, exerciseDir)
			if (!(await isDirectory(exerciseDirPath))) continue

			if (!(await dirHasTrackedFiles(cwd, exerciseDirPath))) {
				gitLog.info(`Deleting empty exercise directory: ${exerciseDirPath}`)
				await fs.rm(exerciseDirPath, { recursive: true, force: true })
				continue
			}

			const stepDirs = (await fs.readdir(exerciseDirPath)).sort()
			for (const stepDir of stepDirs) {
				const stepDirPath = path.join(exerciseDirPath, stepDir)
				if (!(await isDirectory(stepDirPath))) continue

				if (!(await dirHasTrackedFiles(cwd, stepDirPath))) {
					gitLog.info(`Deleting empty step directory: ${stepDirPath}`)
					await fs.rm(stepDirPath, { recursive: true, force: true })
					continue
				}
			}
		}
	} catch (error) {
		console.warn(
			'⚠️ Warning: Failed to cleanup empty directories:',
			getErrorMessage(error),
		)
	}
}

async function getDiffUrl(commitBefore: string, commitAfter: string) {
	const cwd = getWorkshopRoot()
	try {
		const { stdout: remoteUrl } = await execaCommand(
			'git config --get remote.origin.url',
			{ cwd },
		)
		const [, username, repoName] =
			remoteUrl.match(/(?:[^/]+\/|:)([^/]+)\/([^.]+)\.git/) ?? []
		const diffUrl = `https://github.com/${username}/${repoName}/compare/${commitBefore}...${commitAfter}`
		return diffUrl
	} catch (error) {
		console.error('Failed to get repository info:', getErrorMessage(error))
		return null
	}
}

export async function checkForUpdates() {
	const ENV = getEnv()
	const cwd = getWorkshopRoot()
	const packageLockStatus = await getPackageLockStatus(cwd)

	const baseResult = {
		updatesAvailable: packageLockStatus.dependenciesNeedInstall,
		repoUpdatesAvailable: false,
		dependenciesNeedInstall: packageLockStatus.dependenciesNeedInstall,
		updateNotificationId: packageLockStatus.dependenciesNeedInstall
			? getDependencyNotificationId(packageLockStatus.lockfileHash)
			: null,
		commitsAhead: null,
		commitsBehind: null,
		localCommit: null,
		remoteCommit: null,
		diffLink: null,
		message: null,
	}

	if (ENV.EPICSHOP_DEPLOYED) {
		return {
			...baseResult,
			updatesAvailable: false,
			dependenciesNeedInstall: false,
			updateNotificationId: null,
			message: 'The app is deployed',
		} as const
	}

	const online = await checkConnection()
	if (!online) {
		return { ...baseResult, message: 'You are offline' } as const
	}

	const isInRepo = await execaCommand('git rev-parse --is-inside-work-tree', {
		cwd,
	}).then(
		() => true,
		() => false,
	)
	if (!isInRepo) {
		return { ...baseResult, message: 'Not in a git repo' } as const
	}

	const { stdout: remote } = await execaCommand('git remote', { cwd })
	if (!remote) {
		return { ...baseResult, message: 'Cannot find remote' } as const
	}

	let localCommit: string | null = null
	let remoteCommit: string | null = null
	try {
		const currentBranch = (
			await execaCommand('git rev-parse --abbrev-ref HEAD', { cwd })
		).stdout.trim()

		localCommit = (
			await execaCommand('git rev-parse --short HEAD', { cwd })
		).stdout.trim()

		await execaCommand('git fetch --all', { cwd })

		remoteCommit = (
			await execaCommand(`git rev-parse --short origin/${currentBranch}`, {
				cwd,
			})
		).stdout.trim()

		const { stdout } = await execa(
			'git',
			['rev-list', '--count', '--left-right', 'HEAD...@{upstream}'],
			{ cwd },
		)
		const [ahead = 0, behind = 0] = stdout.trim().split(/\s+/).map(Number)
		const repoUpdatesAvailable = behind > 0
		const updatesAvailable =
			repoUpdatesAvailable || packageLockStatus.dependenciesNeedInstall
		const updateNotificationId = repoUpdatesAvailable
			? `update-repo-${remoteCommit}`
			: baseResult.updateNotificationId

		return {
			updatesAvailable,
			repoUpdatesAvailable,
			dependenciesNeedInstall: packageLockStatus.dependenciesNeedInstall,
			updateNotificationId,
			commitsAhead: ahead,
			commitsBehind: behind,
			localCommit,
			remoteCommit,
			diffLink: await getDiffUrl(localCommit, remoteCommit),
			message: baseResult.message,
		} as const
	} catch (error) {
		console.error('Unable to check for updates', getErrorMessage(error))
		return {
			...baseResult,
			localCommit,
			remoteCommit,
			diffLink:
				localCommit && remoteCommit
					? await getDiffUrl(localCommit, remoteCommit)
					: null,
		} as const
	}
}

export async function checkForUpdatesCached() {
	const ENV = getEnv()
	if (ENV.EPICSHOP_DEPLOYED) {
		return {
			updatesAvailable: false,
			repoUpdatesAvailable: false,
			dependenciesNeedInstall: false,
			updateNotificationId: null,
			commitsAhead: null,
			commitsBehind: null,
			localCommit: null,
			remoteCommit: null,
			diffLink: null,
			message: 'The app is deployed',
		} as const
	}

	const key = 'checkForUpdates'
	return cachified({
		ttl: 1000 * 60,
		swr: 1000 * 60 * 60 * 24,
		key,
		getFreshValue: checkForUpdates,
		cache: checkForUpdatesCache,
	})
}

async function runNpmInstallWithRetry(
	cwd: string,
	maxRetries = 3,
	baseDelayMs = 1000,
): Promise<void> {
	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		try {
			await execaCommand('npm install', { cwd, stdio: 'inherit' })
			return
		} catch (error) {
			const isEbusy =
				error instanceof Error &&
				(error.message.includes('EBUSY') ||
					(error as NodeJS.ErrnoException).code === 'EBUSY')

			if (isEbusy && attempt < maxRetries) {
				const delay = baseDelayMs * Math.pow(2, attempt - 1)
				console.log(
					`⚠️  File busy error (attempt ${attempt}/${maxRetries}). ` +
						`Retrying in ${delay / 1000}s...`,
				)
				await new Promise((resolve) => setTimeout(resolve, delay))
			} else {
				throw error
			}
		}
	}
}

export async function updateLocalRepo() {
	const ENV = getEnv()
	if (ENV.EPICSHOP_DEPLOYED) {
		return {
			status: 'error',
			message: 'Updates are not available in deployed environments.',
		} as const
	}

	const cwd = getWorkshopRoot()
	try {
		const updates = await checkForUpdates()
		const repoUpdatesAvailable = updates.repoUpdatesAvailable
		let dependenciesNeedInstall = updates.dependenciesNeedInstall

		if (!repoUpdatesAvailable && !dependenciesNeedInstall) {
			return {
				status: 'success',
				message: updates.message ?? 'No updates available.',
			} as const
		}

		let didPull = false
		let didInstall = false

		if (repoUpdatesAvailable) {
			const uncommittedChanges =
				(await execaCommand('git status --porcelain', { cwd })).stdout.trim()
					.length > 0

			if (uncommittedChanges) {
				console.log('👜 Stashing uncommitted changes...')
				await execaCommand('git stash --include-untracked', { cwd })
			}

			console.log('⬇️ Pulling latest changes...')
			await execaCommand('git pull origin HEAD', { cwd })

			if (uncommittedChanges) {
				console.log('👜 re-applying stashed changes...')
				await execaCommand('git stash pop', { cwd })
			}

			didPull = true
			const postUpdateStatus = await getPackageLockStatus(cwd)
			dependenciesNeedInstall = postUpdateStatus.dependenciesNeedInstall
		}

		if (dependenciesNeedInstall) {
			console.log('📦 Re-installing dependencies...')
			try {
				await runNpmInstallWithRetry(cwd)
				didInstall = true
			} catch (error) {
				const isEbusy =
					error instanceof Error &&
					(error.message.includes('EBUSY') ||
						(error as NodeJS.ErrnoException).code === 'EBUSY')

				if (isEbusy) {
					return {
						status: 'error',
						message:
							'npm install failed: files are locked. ' +
							'Please close any editors or terminals using this directory, ' +
							'then run: npm install',
					} as const
				}
				throw error
			}
		} else if (repoUpdatesAvailable) {
			console.log(
				'📦 Dependencies already match package-lock.json. Skipping npm install.',
			)
		}

		if (didPull || didInstall) {
			await cleanupEmptyExerciseDirectories(cwd)

			const postUpdateScript = getWorkshopConfig().scripts?.postupdate
			if (postUpdateScript) {
				console.log('🏃 Running post update script...')
				await execaCommand(postUpdateScript, { cwd, stdio: 'inherit' })
			}
		}

		return {
			status: 'success',
			message: repoUpdatesAvailable
				? 'Updated successfully.'
				: 'Dependencies updated successfully.',
		} as const
	} catch (error) {
		return { status: 'error', message: getErrorMessage(error) } as const
	}
}

export async function getCommitInfo() {
	const cwd = getWorkshopRoot()
	try {
		const { stdout: hash } = await execaCommand('git rev-parse HEAD', { cwd })
		const { stdout: message } = await execaCommand('git log -1 --pretty=%B', {
			cwd,
		})
		const { stdout: date } = await execaCommand('git log -1 --format=%cI', {
			cwd,
		})
		return { hash: hash.trim(), message: message.trim(), date: date.trim() }
	} catch (error) {
		console.error('Failed to get commit info:', getErrorMessage(error))
		return null
	}
}

export async function getLatestWorkshopAppVersion() {
	const cwd = getWorkshopRoot()
	try {
		const { stdout } = await execaCommand(
			'npm view @epic-web/workshop-app version',
			{ cwd },
		)
		return stdout.trim()
	} catch (error) {
		console.error(
			'Failed to get latest workshop app version:',
			getErrorMessage(error),
		)
		return null
	}
}

export async function checkForExerciseChanges() {
	const ENV = getEnv()
	if (ENV.EPICSHOP_DEPLOYED) return false

	const cwd = getWorkshopRoot()
	try {
		const { stdout } = await execaCommand('git status --porcelain exercises/', {
			cwd,
		})
		return stdout.trim().length > 0
	} catch (error) {
		console.error(
			'Failed to check for exercise changes:',
			getErrorMessage(error),
		)
		return false
	}
}
