import './init-env.ts'

import fs from 'node:fs/promises'
import path from 'node:path'
import { execa, execaCommand } from 'execa'
import { z } from 'zod'
import { getWorkshopRoot } from './apps.server.ts'
import { cachified, checkForUpdatesCache } from './cache.server.ts'
import { getWorkshopConfig } from './config.server.ts'
import { getEnv } from './env.server.ts'
import { logger } from './logger.ts'
import {
	getInstallCommand,
	getWorkspaceInstallStatus,
} from './package-install/package-install-check.server.ts'
import { checkConnection } from './utils.server.ts'
import { getErrorMessage } from './utils.ts'

const gitLog = logger('epic:git')
const CheckForUpdatesSchema = z.object({
	updatesAvailable: z.boolean(),
	repoUpdatesAvailable: z.boolean(),
	dependenciesNeedInstall: z.boolean(),
	updateNotificationId: z.string().nullable(),
	commitsAhead: z.number().nullable(),
	commitsBehind: z.number().nullable(),
	localCommit: z.string().nullable(),
	remoteCommit: z.string().nullable(),
	diffLink: z.string().nullable(),
	message: z.string().nullable(),
})

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

function getDependencyNotificationId(dependencyHash: string | null) {
	if (!dependencyHash) return null
	return `update-deps-${dependencyHash}`
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
	const dependencyStatus = await getWorkspaceInstallStatus(cwd)
	const dependencyNotificationId = dependencyStatus.dependenciesNeedInstall
		? getDependencyNotificationId(dependencyStatus.dependencyHash)
		: null

	const baseResult = {
		updatesAvailable: dependencyStatus.dependenciesNeedInstall,
		repoUpdatesAvailable: false,
		dependenciesNeedInstall: dependencyStatus.dependenciesNeedInstall,
		updateNotificationId: dependencyNotificationId,
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
			repoUpdatesAvailable || dependencyStatus.dependenciesNeedInstall
		const updateNotificationId = repoUpdatesAvailable
			? `update-repo-${remoteCommit}`
			: dependencyNotificationId

		return {
			updatesAvailable,
			repoUpdatesAvailable,
			dependenciesNeedInstall: dependencyStatus.dependenciesNeedInstall,
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
		checkValue: CheckForUpdatesSchema,
		getFreshValue: checkForUpdates,
		cache: checkForUpdatesCache,
	})
}

async function runInstallWithRetry(
	cwd: string,
	command: string,
	args: Array<string>,
	maxRetries = 3,
	baseDelayMs = 1000,
): Promise<void> {
	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		try {
			await execa(command, args, { cwd, stdio: 'inherit' })
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
		let dependencyStatus = await getWorkspaceInstallStatus(cwd)
		let rootsNeedingInstall = dependencyStatus.roots.filter(
			(status) => status.dependenciesNeedInstall,
		)

		if (!repoUpdatesAvailable && rootsNeedingInstall.length === 0) {
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
			dependencyStatus = await getWorkspaceInstallStatus(cwd)
			rootsNeedingInstall = dependencyStatus.roots.filter(
				(status) => status.dependenciesNeedInstall,
			)
		}

		if (rootsNeedingInstall.length > 0) {
			for (const root of rootsNeedingInstall) {
				const rootLabel =
					path.relative(cwd, root.rootDir).replace(/\\/g, '/') || '.'
				const { command, args } = getInstallCommand(root.packageManager)
				const commandLabel = `${command} ${args.join(' ')}`.trim()
				console.log(
					`📦 Installing dependencies in ${rootLabel} using ${commandLabel}...`,
				)
				try {
					await runInstallWithRetry(root.rootDir, command, args)
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
								`${commandLabel} failed: files are locked. ` +
								'Please close any editors or terminals using this directory, ' +
								`then run: ${commandLabel}`,
						} as const
					}
					throw error
				}
			}
		} else if (repoUpdatesAvailable) {
			console.log(
				'📦 Dependencies already match package.json. Skipping install.',
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
