#!/usr/bin/env node

import { promises as dns } from 'node:dns'
import fs from 'node:fs/promises'
import path from 'node:path'
import { execa, execaCommand } from 'execa'

const cwd = process.env.EPICSHOP_CONTEXT_CWD ?? process.cwd()

async function cleanupEmptyExerciseDirectories(cwd) {
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
		let deletedCount = 0
		
		for (const dir of directories) {
			if (dir === 'exercises') continue // Skip the root exercises directory
			
			// Check if directory has any files (excluding gitignored files)
			const [trackedFiles, untrackedFiles] = await Promise.all([
				execaCommand(`git ls-files "${dir}" 2>/dev/null || echo ""`, { cwd, shell: true }),
				execaCommand(`git ls-files --others --exclude-standard "${dir}" 2>/dev/null || echo ""`, { cwd, shell: true })
			])
			
			const totalFiles = (trackedFiles.stdout.trim() + untrackedFiles.stdout.trim()).trim()
			
			if (!totalFiles) {
				console.log(`   Deleting empty directory: ${dir}`)
				await execaCommand(`rmdir "${dir}" 2>/dev/null || true`, { cwd, shell: true })
				deletedCount++
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

await updateLocalRepo()

export async function updateLocalRepo() {
	try {
		const updates = await requireUpdates()
		if (!updates.updatesAvailable) {
			console.log('✅ No updates available.')
			return
		}
		if (updates.diffLink) {
			console.log(`🔍 Updates found.\n👀 Here's the diff: ${updates.diffLink}`)
		} else {
			console.log(`🔍 Updates found. Updating repo.`)
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

		const pkg = JSON.parse(
			String(await fs.readFile(path.join(cwd, 'package.json'))),
		)

		const postUpdateScript = pkg.epicshop?.scripts?.postupdate ?? ''
		if (postUpdateScript) {
			console.log('🏃 Running post update script...')
			await execaCommand(postUpdateScript, { cwd, stdio: 'inherit' })
		}

		console.log('✅ Updated successfully.')
	} catch (error) {
		console.error('❌ Error updating local repo:', getErrorMessage(error))
	}
}

export function getErrorMessage(error) {
	if (typeof error === 'string') return error
	if (
		error &&
		typeof error === 'object' &&
		'message' in error &&
		typeof error.message === 'string'
	) {
		return error.message
	}
	console.error('Unable to get error message for error', error)
	return 'Unknown Error'
}

export async function requireUpdates() {
	const online = await checkConnection()
	if (!online) {
		throw new Error('❌ No internet connection. Cannot check for updates.')
	}

	const isInRepo = await execaCommand('git rev-parse --is-inside-work-tree', {
		cwd,
	}).then(
		() => true,
		() => false,
	)
	if (!isInRepo) {
		throw new Error('❌ Not in a git repository. Cannot check for updates.')
	}

	const { stdout: remote } = await execaCommand('git remote', { cwd })
	if (!remote) {
		throw new Error('❌ No git remote found. Cannot check for updates.')
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
			diffLink: await getDiffUrl(localCommit, remoteCommit),
		}
	} catch (error) {
		throw new Error(
			`❌ Failed checking for updates: ${getErrorMessage(error)}`,
			{ cause: error },
		)
	}
}

async function getDiffUrl(commitBefore, commitAfter) {
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

export async function checkConnection() {
	return dns.resolve('registry.npmjs.com').then(
		() => true,
		() => false,
	)
}
