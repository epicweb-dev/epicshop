import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { execa } from 'execa'
import { globby } from 'globby'

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
	const url = `https://api.github.com/search/repositories?q=topic:workshop+org:${GITHUB_ORG}+archived:false&sort=stars&order=desc`

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
	return Array.isArray(data?.items) ? data.items : []
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
				Authorization: `Bearer ${GITHUB_TOKEN}`,
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
 * Get workspace patterns from a package.json file
 */
function getWorkspacePatterns(pkgJson) {
	const workspaces = pkgJson.workspaces
	if (!workspaces) return []
	// Handle both array format and object format with packages property
	if (Array.isArray(workspaces)) {
		return workspaces
	}
	if (workspaces.packages && Array.isArray(workspaces.packages)) {
		return workspaces.packages
	}
	return []
}

/**
 * Convert a workspace entry (directory glob) into a package.json glob
 */
function workspacePatternToPackageJsonGlob(pattern) {
	if (!pattern || typeof pattern !== 'string') return null
	const normalized = pattern.replace(/\\/g, '/')
	if (normalized.endsWith('/package.json')) return normalized
	if (normalized === 'package.json') return normalized
	const withoutTrailingSlash = normalized.replace(/\/$/, '')
	return `${withoutTrailingSlash}/package.json`
}

/**
 * Returns true if `candidateDir` is the same as, or inside, `parentDir`.
 */
function isSameOrInsideDir(candidateDir, parentDir) {
	const relative = path.relative(parentDir, candidateDir)
	if (!relative) return true
	return (
		relative !== '..' &&
		!relative.startsWith(`..${path.sep}`) &&
		!path.isAbsolute(relative)
	)
}

/**
 * Determine the minimal set of directories where we should run `npm install`.
 *
 * Rules:
 * - If a changed package.json lives inside a workspace member directory, run
 *   install at the *workspace root* (not the member, and not any nested dir).
 * - If a changed package.json is not covered by any workspace root, run install
 *   in that package.json's directory.
 *
 * This fixes cases where the workspace root package.json didn't change (so the
 * previous implementation missed its workspaces config) and cases where nested
 * package.json files exist inside workspace members.
 */
async function getInstallDirsForChangedPackages(changedPkgs, workshopDir) {
	const allPkgJsonPaths = await globby('**/package.json', {
		cwd: workshopDir,
		gitignore: true,
	})

	/** @type {Array<{dirAbs: string, dirRel: string, patterns: string[], memberDirsAbs: string[]}>} */
	const workspaceRoots = []

	// Collect every workspace root and expand its workspace member directories.
	for (const pkg of allPkgJsonPaths) {
		const pkgPathAbs = path.join(workshopDir, pkg)
		const dirAbs = path.dirname(pkgPathAbs)
		const dirRel = path.relative(workshopDir, dirAbs).replace(/\\/g, '/') || '.'
		try {
			const contents = await fs.readFile(pkgPathAbs, 'utf8')
			const pkgJson = JSON.parse(contents)
			const patterns = getWorkspacePatterns(pkgJson)
			if (!patterns.length) continue

			const memberPkgJsonGlobs = patterns
				.map(workspacePatternToPackageJsonGlob)
				.filter(Boolean)

			// Expand to actual package.json files, then treat their directories as
			// "covered" (including nested package.json files within them).
			const memberPkgJsonPaths = await globby(memberPkgJsonGlobs, {
				cwd: dirAbs,
				gitignore: true,
			})

			const memberDirsAbs = Array.from(
				new Set(
					memberPkgJsonPaths.map((p) => path.join(dirAbs, path.dirname(p))),
				),
			)

			workspaceRoots.push({ dirAbs, dirRel, patterns, memberDirsAbs })
		} catch {
			// Ignore invalid package.json files for workspace detection
		}
	}

	// Prefer the deepest workspace root that covers the changed package.
	workspaceRoots.sort((a, b) => b.dirAbs.length - a.dirAbs.length)

	const installDirsAbs = new Set()

	for (const changedPkg of changedPkgs) {
		const changedPkgPathAbs = path.join(workshopDir, changedPkg)
		const changedDirAbs = path.dirname(changedPkgPathAbs)

		let chosenWorkspaceRoot = null
		for (const root of workspaceRoots) {
			for (const memberDirAbs of root.memberDirsAbs) {
				if (isSameOrInsideDir(changedDirAbs, memberDirAbs)) {
					chosenWorkspaceRoot = root
					break
				}
			}
			if (chosenWorkspaceRoot) break
		}

		if (chosenWorkspaceRoot) {
			installDirsAbs.add(chosenWorkspaceRoot.dirAbs)
		} else {
			installDirsAbs.add(changedDirAbs)
		}
	}

	return Array.from(installDirsAbs)
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
	const changedPkgs = []

	for (const pkg of pkgs) {
		const pkgPath = path.join(workshopDir, pkg)
		const contents = await fs.readFile(pkgPath, 'utf8')
		const newContents = contents
			.replace(/(@epic-web\/workshop-[^":]+":\s*")([^"]+)"/g, `$1^${version}"`)
			.replace(/(epicshop":\s*")([^"]+)"/g, `$1^${version}"`)

		if (contents !== newContents) {
			await fs.writeFile(pkgPath, newContents, 'utf8')
			changed = true
			changedPkgs.push(pkg)
		}
	}

	return { changed, pkgs, changedPkgs }
}

/**
 * Update a single workshop repository
 */
async function updateWorkshopRepo(repo, version) {
	const repoName = repo.name
	const repoUrl = getAuthenticatedRepoUrl(repoName)
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
				env: getGitEnv(),
			},
		)

		// Ensure future push operations use an authenticated remote URL.
		// (Some git versions can normalize remotes in ways that drop credentials.)
		await execa('git', ['remote', 'set-url', 'origin', repoUrl], {
			cwd: tempDir,
			env: getGitEnv(),
		})

		// Pull latest *before* making changes/committing (reduces push failures)
		await pullRebaseWithFallback(tempDir)

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

		// Determine minimal install targets, respecting npm/yarn/pnpm workspaces.
		const installDirs = await getInstallDirsForChangedPackages(
			changedPkgs,
			tempDir,
		)

		for (const installDir of installDirs) {
			const rel = path.relative(tempDir, installDir).replace(/\\/g, '/')
			console.log(
				`📦 ${repoName} - running npm install in ${rel ? rel : 'root'}`,
			)
			await execa('npm', ['install', '--ignore-scripts'], {
				cwd: installDir,
				env: getGitEnv(),
			})
		}

		// Find package-lock.json files
		const pkgLocks = await globby('**/package-lock.json', {
			cwd: tempDir,
			gitignore: true,
		})

		// Stage changes
		console.log(`📝 ${repoName} - staging changes`)
		await execa('git', ['add', ...pkgLocks, ...pkgs], {
			cwd: tempDir,
			env: getGitEnv(),
		})

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
