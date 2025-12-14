import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { execa } from 'execa'
import { globby } from 'globby'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const GITHUB_ORG = 'epicweb-dev'
const GITHUB_TOKEN = process.env.GITHUB_TOKEN
const CONCURRENCY = 5

if (!GITHUB_TOKEN) {
	console.error('❌ GITHUB_TOKEN environment variable is required')
	process.exit(1)
}

/**
 * Fetch available workshops from GitHub (epicweb-dev org with 'workshop' topic)
 */
async function fetchAvailableWorkshops() {
	const url = `https://api.github.com/search/repositories?q=topic:workshop+org:${GITHUB_ORG}&sort=stars&order=desc`

	const response = await fetch(url, {
		headers: {
			Accept: 'application/vnd.github.v3+json',
			Authorization: `token ${GITHUB_TOKEN}`,
			'User-Agent': 'epicshop-update-action',
		},
	})

	if (!response.ok) {
		if (response.status === 403) {
			throw new Error(
				'GitHub API rate limit exceeded. Please try again in a minute.',
			)
		}
		throw new Error(`Failed to fetch workshops from GitHub: ${response.status}`)
	}

	const data = await response.json()
	return data.items
}

/**
 * Get the latest version of @epic-web/workshop-app from npm
 */
async function getLatestVersion() {
	try {
		const { stdout } = await execa('npm', [
			'show',
			'@epic-web/workshop-app',
			'version',
		])
		return stdout.trim()
	} catch (error) {
		console.error('❌ Failed to get latest version:', error.message)
		throw error
	}
}

/**
 * Check if a repo already has the target version via GitHub API
 * Returns true if the repo is already up to date
 */
async function isRepoUpToDate(repoName, targetVersion) {
	try {
		const url = `https://api.github.com/repos/${GITHUB_ORG}/${repoName}/contents/package.json`
		const response = await fetch(url, {
			headers: {
				Accept: 'application/vnd.github.v3.raw',
				Authorization: `token ${GITHUB_TOKEN}`,
				'User-Agent': 'epicshop-update-action',
			},
		})

		if (!response.ok) return false

		const raw = await response.text()
		const pkg = JSON.parse(raw)

		const wanted = `^${targetVersion}`
		const depFields = [
			'dependencies',
			'devDependencies',
			'peerDependencies',
			'optionalDependencies',
		]

		let foundAny = false

		for (const field of depFields) {
			const deps = pkg?.[field]
			if (!deps) continue
			for (const [name, range] of Object.entries(deps)) {
				if (typeof range !== 'string') continue
				if (name === 'epicshop' || name.startsWith('@epic-web/workshop-')) {
					foundAny = true
					if (range !== wanted) return false
				}
			}
		}

		// If the root package.json doesn't reference these packages, we can't be sure.
		// Don't skip cloning in that case.
		return foundAny
	} catch {
		// If we can't check, assume it needs updating
		return false
	}
}

async function pullRebaseWithFallback(cwd) {
	try {
		await execa('git', ['pull', '--rebase'], { cwd })
	} catch (error) {
		// Shallow clones sometimes can't rebase/pull without more history.
		try {
			await execa('git', ['fetch', '--unshallow'], { cwd })
		} catch {
			await execa('git', ['fetch', '--depth=50'], { cwd })
		}
		await execa('git', ['pull', '--rebase'], { cwd })
	}
}

/**
 * Update package.json files in a directory
 */
async function updatePackageJsonFiles(workshopDir, version) {
	const pkgs = await globby('**/package.json', {
		cwd: workshopDir,
		gitignore: true,
	})

	let changed = false

	for (const pkg of pkgs) {
		const pkgPath = path.join(workshopDir, pkg)
		const contents = await fs.readFile(pkgPath, 'utf8')
		const newContents = contents
			.replace(/(@epic-web\/workshop-[^":]+":\s*")([^"]+)"/g, `$1^${version}"`)
			.replace(/(epicshop":\s*")([^"]+)"/g, `$1^${version}"`)

		if (contents !== newContents) {
			await fs.writeFile(pkgPath, newContents, 'utf8')
			changed = true
		}
	}

	return { changed, pkgs }
}

/**
 * Update a single workshop repository
 */
async function updateWorkshopRepo(repo, version) {
	const repoName = repo.name
	const repoUrl = `https://${GITHUB_TOKEN}@github.com/${GITHUB_ORG}/${repoName}.git`
	const tempDir = path.join(__dirname, 'temp-workshops', repoName)

	try {
		// Check if repo is already up to date via API (avoids unnecessary clone)
		const upToDate = await isRepoUpToDate(repoName, version)
		if (upToDate) {
			console.log(`🟢 ${repoName} - already up to date (skipped clone)`)
			return { repo: repoName, status: 'skipped' }
		}

		// Clean up temp directory if it exists
		await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {})

		// Create temp directory
		await fs.mkdir(path.dirname(tempDir), { recursive: true })

		console.log(`🔍 ${repoName} - cloning repository`)

		// Shallow clone for faster checkout (we only need latest state)
		await execa(
			'git',
			['clone', '--depth=1', '--filter=blob:none', repoUrl, tempDir],
			{
				env: {},
			},
		)

		// Pull latest *before* making changes/committing (reduces push failures)
		await pullRebaseWithFallback(tempDir)

		// Update package.json files
		console.log(`📝 ${repoName} - updating package.json files`)
		const { changed, pkgs } = await updatePackageJsonFiles(tempDir, version)

		if (!changed) {
			console.log(`🟢 ${repoName} - already up to date`)
			await fs.rm(tempDir, { recursive: true, force: true })
			return { repo: repoName, status: 'up-to-date' }
		}

		// Run npm install to update package-lock.json
		console.log(`📦 ${repoName} - running npm install`)
		await execa('npm', ['install'], {
			cwd: tempDir,
			env: {},
		})

		// Find package-lock.json files
		const pkgLocks = await globby('**/package-lock.json', {
			cwd: tempDir,
			gitignore: true,
		})

		// Stage changes
		console.log(`📝 ${repoName} - staging changes`)
		await execa('git', ['add', ...pkgLocks, ...pkgs], {
			cwd: tempDir,
			env: {},
		})

		// Check if there are actually staged changes
		const { stdout: diffOutput } = await execa(
			'git',
			['diff', '--cached', '--name-only'],
			{ cwd: tempDir },
		)
		if (!diffOutput.trim()) {
			console.log(`🟢 ${repoName} - no changes to commit`)
			await fs.rm(tempDir, { recursive: true, force: true })
			return { repo: repoName, status: 'no-changes' }
		}

		// Commit changes
		console.log(`💾 ${repoName} - committing changes`)
		await execa('git', ['commit', '-m', 'chore: update epicshop'], {
			cwd: tempDir,
			env: {},
		})

		// Push changes (retry once with a pull/rebase if needed)
		console.log(`⬆️  ${repoName} - pushing changes`)
		try {
			await execa('git', ['push'], {
				cwd: tempDir,
				env: {},
			})
		} catch {
			await pullRebaseWithFallback(tempDir)
			await execa('git', ['push'], {
				cwd: tempDir,
				env: {},
			})
		}

		console.log(`✅ ${repoName} - updated successfully`)
		return { repo: repoName, status: 'updated' }
	} catch (error) {
		console.error(`❌ ${repoName} - failed:`, error.message)
		if (error.all) {
			console.error(error.all)
		}
		return { repo: repoName, status: 'failed', error: error.message }
	} finally {
		// Clean up temp directory
		await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {})
	}
}

/**
 * Main function
 */
async function main() {
	try {
		console.log('🔍 Fetching workshop repositories from GitHub...')
		const workshops = await fetchAvailableWorkshops()

		if (workshops.length === 0) {
			console.log('⚠️  No workshops found')
			return
		}

		console.log(`📚 Found ${workshops.length} workshop repositories:`)
		workshops.forEach((w) => {
			console.log(`  - ${w.name}`)
		})
		console.log()

		console.log('📦 Getting latest version from npm...')
		const version = await getLatestVersion()
		console.log(`🔍 Updating to version ${version}`)
		console.log(
			`🚀 Processing ${workshops.length} repos with concurrency ${CONCURRENCY}\n`,
		)

		// Process repos in parallel with a simple concurrency pool (no extra deps)
		const results = []
		const queue = [...workshops]
		const workers = Array.from({ length: CONCURRENCY }, async () => {
			while (queue.length) {
				const repo = queue.shift()
				if (!repo) break
				results.push(await updateWorkshopRepo(repo, version))
			}
		})
		await Promise.all(workers)

		// Summary
		const updated = results.filter((r) => r.status === 'updated')
		const skipped = results.filter(
			(r) =>
				r.status === 'skipped' ||
				r.status === 'up-to-date' ||
				r.status === 'no-changes',
		)
		const failed = results.filter((r) => r.status === 'failed')

		console.log('\n' + '='.repeat(50))
		console.log('📊 Summary:')
		console.log(`  ✅ Updated: ${updated.length}`)
		console.log(`  🟢 Skipped (up to date): ${skipped.length}`)
		console.log(`  ❌ Failed: ${failed.length}`)

		if (failed.length > 0) {
			console.log('\nFailed repositories:')
			failed.forEach((r) => {
				console.log(`  - ${r.repo}: ${r.error}`)
			})
		}

		console.log('\n✅ All workshops processed')

		// Exit with error if any failed
		if (failed.length > 0) {
			process.exit(1)
		}
	} catch (error) {
		console.error('❌ Fatal error:', error.message)
		process.exit(1)
	}
}

await main()

