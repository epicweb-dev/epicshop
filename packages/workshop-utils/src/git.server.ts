import './init-env.js'

import fs from 'node:fs/promises'
import path from 'node:path'
import { execa, execaCommand } from 'execa'
import { getWorkshopRoot } from './apps.server.js'
import { cachified, checkForUpdatesCache } from './cache.server.js'
import { getWorkshopConfig } from './config.server.js'
import { getEnv } from './env.server.js'
import { logger } from './logger.js'
import { getErrorMessage } from './utils.js'
import { checkConnection } from './utils.server.js'

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
	if (ENV.EPICSHOP_DEPLOYED) {
		return { updatesAvailable: false, message: 'The app is deployed' } as const
	}

	const cwd = getWorkshopRoot()
	const online = await checkConnection()
	if (!online) {
		return { updatesAvailable: false, message: 'You are offline' } as const
	}

	const isInRepo = await execaCommand('git rev-parse --is-inside-work-tree', {
		cwd,
	}).then(
		() => true,
		() => false,
	)
	if (!isInRepo) {
		return { updatesAvailable: false, message: 'Not in a git repo' } as const
	}

	const { stdout: remote } = await execaCommand('git remote', { cwd })
	if (!remote) {
		return { updatesAvailable: false, message: 'Cannot find remote' } as const
	}

	let localCommit, remoteCommit
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
		const [, behind = 0] = stdout.trim().split(/\s+/).map(Number)
		const updatesAvailable = behind > 0

		return {
			updatesAvailable,
			localCommit,
			remoteCommit,
			diffLink: await getDiffUrl(localCommit, remoteCommit),
			message: null,
		} as const
	} catch (error) {
		console.error('Unable to check for updates', getErrorMessage(error))
		return {
			updatesAvailable: false,
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
		return { updatesAvailable: false } as const
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
		if (!updates.updatesAvailable) {
			return {
				status: 'success',
				message: updates.message ?? 'No updates available.',
			} as const
		}

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

		console.log('📦 Re-installing dependencies...')
		await execaCommand('npm install', { cwd, stdio: 'inherit' })

		await cleanupEmptyExerciseDirectories(cwd)

		const postUpdateScript = getWorkshopConfig().scripts?.postupdate
		if (postUpdateScript) {
			console.log('🏃 Running post update script...')
			await execaCommand(postUpdateScript, { cwd, stdio: 'inherit' })
		}

		return { status: 'success', message: 'Updated successfully.' } as const
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
