import { execa } from 'execa'
import { globby } from 'globby'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const GITHUB_ORG = 'epicweb-dev'
const GITHUB_TOKEN = process.env.GITHUB_TOKEN

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
 * Check if a directory has uncommitted changes
 */
async function hasUncommittedChanges(cwd) {
	try {
		const { stdout } = await execa('git', ['status', '--porcelain'], { cwd })
		return stdout.trim() !== ''
	} catch (error) {
		return false
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
	const tempDir = path.join(__dirname, '..', 'temp-workshops', repoName)

	try {
		// Clean up temp directory if it exists
		try {
			await fs.rm(tempDir, { recursive: true, force: true })
		} catch {
			// Directory doesn't exist, that's fine
		}

		// Create temp directory
		await fs.mkdir(path.dirname(tempDir), { recursive: true })

		console.log(`🔍 ${repoName} - cloning repository`)

		// Clone the repository
		await execa('git', ['clone', repoUrl, tempDir], {
			env: {},
		})

		// Check for uncommitted changes
		const hasChanges = await hasUncommittedChanges(tempDir)
		if (hasChanges) {
			console.log(`📦 ${repoName} - stashing uncommitted changes`)
			try {
				await execa('git', ['stash'], { cwd: tempDir })
			} catch (error) {
				console.error(`⚠️  ${repoName} - failed to stash:`, error.message)
				throw new Error(`Failed to stash changes: ${error.message}`)
			}
		}

		// Update package.json files
		console.log(`📝 ${repoName} - updating package.json files`)
		const { changed, pkgs } = await updatePackageJsonFiles(tempDir, version)

		if (!changed) {
			console.log(`🟢 ${repoName} - already up to date`)
			// Clean up temp directory
			await fs.rm(tempDir, { recursive: true, force: true })
			return
		}

		// Run npm install
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

		// Commit changes
		console.log(`💾 ${repoName} - committing changes`)
		await execa('git', ['commit', '-m', 'chore: update epicshop'], {
			cwd: tempDir,
			env: {},
		})

		// Pull latest changes
		console.log(`⬇️  ${repoName} - pulling latest changes`)
		try {
			await execa('git', ['pull', '--rebase'], {
				cwd: tempDir,
				env: {},
			})
		} catch (error) {
			console.error(`⚠️  ${repoName} - pull failed:`, error.message)
			// Continue anyway, might be a conflict we can handle
		}

		// Push changes
		console.log(`⬆️  ${repoName} - pushing changes`)
		await execa('git', ['push'], {
			cwd: tempDir,
			env: {},
		})

		// Restore stashed changes if any
		if (hasChanges) {
			try {
				await execa('git', ['stash', 'pop'], {
					cwd: tempDir,
					env: {},
				})
			} catch {
				// Stash pop might fail if there are conflicts, that's okay
			}
		}

		console.log(`✅ ${repoName} - finished`)
	} catch (error) {
		console.error(`❌ ${repoName} - failed:`, error.message)
		if (error.all) {
			console.error(error.all)
		}
		throw error
	} finally {
		// Clean up temp directory
		try {
			await fs.rm(tempDir, { recursive: true, force: true })
		} catch {
			// Ignore cleanup errors
		}
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
		console.log(`🔍 Updating to version ${version}\n`)

		// Process repos sequentially to avoid rate limits
		for (const repo of workshops) {
			try {
				await updateWorkshopRepo(repo, version)
			} catch (error) {
				console.error(`❌ Failed to update ${repo.name}:`, error.message)
				// Continue with next repo
			}
		}

		console.log('\n✅ All workshops processed')
	} catch (error) {
		console.error('❌ Fatal error:', error.message)
		process.exit(1)
	}
}

await main()
