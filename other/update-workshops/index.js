import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { execa } from 'execa'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const GITHUB_ORG = 'epicweb-dev'
// Prefer a dedicated PAT for cross-repo writes; fall back to GITHUB_TOKEN.
// In GitHub Actions, the default GITHUB_TOKEN often only has write access to the
// repository running the workflow (not other repos), unless explicitly allowed.
const GITHUB_TOKEN =
	process.env.WORKSHOP_UPDATE_TOKEN ?? process.env.GITHUB_TOKEN
const USING_WORKSHOP_UPDATE_TOKEN = Boolean(process.env.WORKSHOP_UPDATE_TOKEN)
const CONCURRENCY = 5

if (!GITHUB_TOKEN) {
	console.error(
		'❌ Missing GitHub token. Set WORKSHOP_UPDATE_TOKEN (preferred) or GITHUB_TOKEN.',
	)
	process.exit(1)
}

function getGitEnv() {
	return {
		// Never allow git to prompt for credentials in CI.
		GIT_TERMINAL_PROMPT: '0',
		// Some git versions still attempt to invoke an askpass helper; make it a no-op.
		GIT_ASKPASS: 'echo',
	}
}

function getAuthenticatedRepoUrl(repoName) {
	// Important: token must be used as the *password* for HTTPS auth.
	// If you do https://<token>@github.com/... git treats <token> as the username
	// and prompts for a password (which fails in Actions).
	return `https://x-access-token:${GITHUB_TOKEN}@github.com/${GITHUB_ORG}/${repoName}.git`
}

/**
 * Fetch available workshops from GitHub (epicweb-dev org with 'workshop' topic)
 */
async function fetchAvailableWorkshops() {
	// Note: `archived:false` is supported by GitHub search.
	const baseUrl = `https://api.github.com/search/repositories?q=topic:workshop+org:${GITHUB_ORG}+archived:false&sort=stars&order=desc`
	const perPage = 100
	// GitHub Search API defaults to 30 results per page and caps at 1000 results.
	const maxPages = 10
	const allItems = []
	let totalCount = null

	for (let page = 1; page <= maxPages; page++) {
		const url = new URL(baseUrl)
		url.searchParams.set('per_page', String(perPage))
		url.searchParams.set('page', String(page))

		const response = await fetch(url, {
			headers: {
				Accept: 'application/vnd.github.v3+json',
				Authorization: `Bearer ${GITHUB_TOKEN}`,
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
		const items = Array.isArray(data?.items) ? data.items : []
		if (typeof data?.total_count === 'number') totalCount = data.total_count

		allItems.push(...items)

		if (items.length < perPage) break
		if (totalCount !== null && allItems.length >= totalCount) break
	}

	return allItems
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

async function pullRebaseWithFallback(cwd) {
	try {
		await execa('git', ['pull', '--rebase'], { cwd, env: getGitEnv() })
	} catch {
		// Shallow clones sometimes can't rebase/pull without more history.
		try {
			await execa('git', ['fetch', '--unshallow'], { cwd, env: getGitEnv() })
		} catch {
			await execa('git', ['fetch', '--depth=50'], { cwd, env: getGitEnv() })
		}
		await execa('git', ['pull', '--rebase'], { cwd, env: getGitEnv() })
	}
}

/**
 * Update package.json files - only root and epicshop/package.json
 */
async function updatePackageJsonFiles(workshopDir, version) {
	const pkgs = ['package.json', 'epicshop/package.json']
	const changedPkgs = []
	const existingPkgs = []
	let changed = false

	for (const pkg of pkgs) {
		const pkgPath = path.join(workshopDir, pkg)
		try {
			const contents = await fs.readFile(pkgPath, 'utf8')
			existingPkgs.push(pkg)
			const newContents = contents
				.replace(
					/(@epic-web\/workshop-[^":]+":\s*")([^"]+)"/g,
					`$1^${version}"`,
				)
				.replace(/(epicshop":\s*")([^"]+)"/g, `$1^${version}"`)

			if (contents !== newContents) {
				await fs.writeFile(pkgPath, newContents, 'utf8')
				changed = true
				changedPkgs.push(pkg)
			}
		} catch (error) {
			// File doesn't exist, skip it
			if (error?.code !== 'ENOENT') throw error
		}
	}

	return { changed, pkgs: existingPkgs, changedPkgs }
}

/**
 * Update a single workshop repository
 */
async function updateWorkshopRepo(repo, version) {
	const repoName = repo.name
	const repoUrl = getAuthenticatedRepoUrl(repoName)
	const tempDir = path.join(__dirname, 'temp-workshops', repoName)

	try {
		// Clean up temp directory if it exists
		await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {})

		// Create temp directory
		await fs.mkdir(path.dirname(tempDir), { recursive: true })

		console.log(`🔍 ${repoName} - cloning repository with sparse checkout`)

		// Clone with sparse checkout - only get the 4 files we need
		await execa(
			'git',
			[
				'clone',
				'--depth=1',
				'--filter=blob:none',
				'--sparse',
				repoUrl,
				tempDir,
			],
			{
				env: getGitEnv(),
			},
		)

		// Configure sparse checkout to only include root directory and epicshop directory
		// Using directory patterns is much faster than individual files
		await execa('git', ['sparse-checkout', 'set', '.', 'epicshop'], {
			cwd: tempDir,
			env: getGitEnv(),
		})

		// Ensure future push operations use an authenticated remote URL.
		// (Some git versions can normalize remotes in ways that drop credentials.)
		await execa('git', ['remote', 'set-url', 'origin', repoUrl], {
			cwd: tempDir,
			env: getGitEnv(),
		})

		// Update package.json files
		console.log(`📝 ${repoName} - updating package.json files`)
		const { changed, pkgs, changedPkgs } = await updatePackageJsonFiles(
			tempDir,
			version,
		)

		if (!changed) {
			console.log(`🟢 ${repoName} - already up to date`)
			return { repo: repoName, status: 'up-to-date' }
		}

		// Run npm install only in directories where package.json changed
		// We only handle root and epicshop directories
		const installDirs = []
		for (const pkg of changedPkgs) {
			const installDir =
				pkg === 'package.json' ? tempDir : path.join(tempDir, path.dirname(pkg))
			if (!installDirs.includes(installDir)) {
				installDirs.push(installDir)
			}
		}

		for (const installDir of installDirs) {
			const rel = path.relative(tempDir, installDir).replace(/\\/g, '/')
			console.log(`📦 ${repoName} - running npm install in ${rel || 'root'}`)
			try {
				await execa('npm', ['install', '--ignore-scripts'], {
					cwd: installDir,
					env: getGitEnv(),
				})
			} catch {
				// If npm install fails (e.g., package.json doesn't exist), skip it
				console.log(
					`⚠️  ${repoName} - npm install failed in ${rel || 'root'}, skipping`,
				)
			}
		}

		// Only stage the 4 files we're tracking
		const filesToStage = []
		for (const pkg of pkgs) {
			const pkgPath = path.join(tempDir, pkg)
			try {
				await fs.access(pkgPath)
				filesToStage.push(pkg)
			} catch {
				// File doesn't exist, skip
			}
		}
		for (const pkg of pkgs) {
			const lockPath = pkg.replace('package.json', 'package-lock.json')
			const lockPathFull = path.join(tempDir, lockPath)
			try {
				await fs.access(lockPathFull)
				filesToStage.push(lockPath)
			} catch {
				// File doesn't exist, skip
			}
		}

		// Stage changes
		console.log(`📝 ${repoName} - staging changes`)
		if (filesToStage.length > 0) {
			await execa('git', ['add', ...filesToStage], {
				cwd: tempDir,
				env: getGitEnv(),
			})
		}

		// Check if there are actually staged changes
		const { stdout: diffOutput } = await execa(
			'git',
			['diff', '--cached', '--name-only'],
			{ cwd: tempDir },
		)
		if (!diffOutput.trim()) {
			console.log(`🟢 ${repoName} - no changes to commit`)
			return { repo: repoName, status: 'no-changes' }
		}

		// Commit changes
		console.log(`💾 ${repoName} - committing changes`)
		await execa('git', ['commit', '-m', 'chore: update epicshop'], {
			cwd: tempDir,
			env: getGitEnv(),
		})

		// Push changes (retry once with a pull/rebase if needed)
		console.log(`⬆️  ${repoName} - pushing changes`)
		try {
			await execa('git', ['push'], {
				cwd: tempDir,
				env: getGitEnv(),
			})
		} catch {
			await pullRebaseWithFallback(tempDir)
			await execa('git', ['push'], {
				cwd: tempDir,
				env: getGitEnv(),
			})
		}

		console.log(`✅ ${repoName} - updated successfully`)
		return { repo: repoName, status: 'updated' }
	} catch (error) {
		console.error(`❌ ${repoName} - failed:`, error.message)
		if (error.all) {
			console.error(error.all)
		}
		const message = String(error?.message ?? error)
		const authHint =
			message.includes('Authentication failed') ||
			message.includes('could not read Password') ||
			message.includes('terminal prompts disabled') ||
			message.includes('403')
				? ' (auth issue: ensure WORKSHOP_UPDATE_TOKEN is a PAT with write access to these repos)'
				: ''
		return {
			repo: repoName,
			status: 'failed',
			error: `${message}${authHint}`,
		}
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
		console.log(
			`🔐 Auth: using ${USING_WORKSHOP_UPDATE_TOKEN ? 'WORKSHOP_UPDATE_TOKEN' : 'GITHUB_TOKEN'}`,
		)
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
