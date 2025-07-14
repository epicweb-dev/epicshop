import { execa, execaCommand } from 'execa'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { getWorkshopRoot } from './apps.server.js'
import { cachified, checkForUpdatesCache } from './cache.server.js'
import { getWorkshopConfig } from './config.server.js'
import { getEnv } from './env.server.js'
import { getErrorMessage } from './utils.js'
import { checkConnection } from './utils.server.js'

async function cleanupEmptyExerciseDirectories(cwd: string) {
	try {
		console.log('🧹 Cleaning up empty exercise directories...')
		
		// Find all directories under exercises/* and exercises/*/*
		const { stdout: allDirs } = await execaCommand(
			'find exercises -type d 2>/dev/null || echo ""',
			{ cwd, shell: true }
		)
		
		if (!allDirs.trim()) {
			console.log('   No exercises directory found, skipping cleanup.')
			return
		}
		
		const directories = allDirs.trim().split('\n').filter(Boolean)
		// Sort directories in reverse order (deepest first) to ensure proper cleanup of nested empty directories
		directories.sort((a, b) => b.length - a.length)
		
		let deletedCount = 0
		
		for (const dir of directories) {
			if (dir === 'exercises') continue // Skip the root exercises directory
			
			// Check if directory has any files (excluding gitignored files)
			const [trackedFiles, untrackedFiles] = await Promise.all([
				execa('git', ['ls-files', dir], { cwd, reject: false }).catch(() => ({ stdout: '' })),
				execa('git', ['ls-files', '--others', '--exclude-standard', dir], { cwd, reject: false }).catch(() => ({ stdout: '' }))
			])
			
			// Fix: Use proper boolean logic to check if both outputs are empty
			const hasTrackedFiles = trackedFiles.stdout.trim().length > 0
			const hasUntrackedFiles = untrackedFiles.stdout.trim().length > 0
			const hasFiles = hasTrackedFiles || hasUntrackedFiles
			
			if (!hasFiles) {
				console.log(`   Deleting empty directory: ${dir}`)
				try {
					// Use fs.rmdir instead of shell command to avoid shell injection
					await fs.rmdir(path.join(cwd, dir))
					deletedCount++
				} catch (error) {
					// Directory might not be empty or might not exist, which is fine
					// We'll just continue with the next directory
				}
			}
		}
		
		if (deletedCount > 0) {
			console.log(`   Deleted ${deletedCount} empty directories.`)
		} else {
			console.log('   No empty directories found.')
		}
	} catch (error) {
		console.warn('   Warning: Failed to cleanup empty directories:', getErrorMessage(error))
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
		return { updatesAvailable: false } as const
	}

	const cwd = getWorkshopRoot()
	const online = await checkConnection()
	if (!online) return { updatesAvailable: false } as const

	const isInRepo = await execaCommand('git rev-parse --is-inside-work-tree', {
		cwd,
	}).then(
		() => true,
		() => false,
	)
	if (!isInRepo) {
		return { updatesAvailable: false } as const
	}

	const { stdout: remote } = await execaCommand('git remote', { cwd })
	if (!remote) {
		return { updatesAvailable: false } as const
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
			return { status: 'success', message: 'No updates available.' } as const
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
