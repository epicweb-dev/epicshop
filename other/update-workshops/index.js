import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { execa } from 'execa'
import semver from 'semver'
import {
	DEPLOY_WORKFLOW_PATH,
	canUpdateWorkflowFiles,
	isWorkflowScopeError,
	parseOAuthScopes,
	partitionFilesByWorkflow,
	workflowScopeHint,
} from './helpers.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const GITHUB_ORG = 'epicweb-dev'
// Prefer a dedicated PAT for cross-repo writes; fall back to GITHUB_TOKEN.
// In GitHub Actions, the default GITHUB_TOKEN often only has write access to the
// repository running the workflow (not other repos), unless explicitly allowed.
const GITHUB_TOKEN =
	process.env.WORKSHOP_UPDATE_TOKEN ?? process.env.GITHUB_TOKEN
const USING_WORKSHOP_UPDATE_TOKEN = Boolean(process.env.WORKSHOP_UPDATE_TOKEN)
// Keep clone/install work parallel, but serialize git pushes so workshop deploy
// workflows do not stampede Fly leases / machines API health checks.
const CONCURRENCY = 5
const PUSH_STAGGER_MS = Number(process.env.PUSH_STAGGER_MS || 90_000)
const TARGET_NODE_VERSION = '26.0.0'
const ADDITIONAL_WORKSHOP_REPOS = ['ai-powered-apps', 'workshop-template']
const CANONICAL_DEPLOY_WORKFLOW = path.join(
	__dirname,
	'canonical',
	'deploy.yml',
)
const FLY_CONFIG_PATH = 'epicshop/fly.yaml'

let lastPushAt = 0
let pushChain = Promise.resolve()

function delay(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

async function withPushStagger(fn) {
	const run = pushChain.then(async () => {
		const waitMs = Math.max(0, PUSH_STAGGER_MS - (Date.now() - lastPushAt))
		if (waitMs > 0) {
			console.log(
				`⏳ Staggering push by ${Math.round(waitMs / 1000)}s to avoid Fly deploy stampedes`,
			)
			await delay(waitMs)
		}
		try {
			return await fn()
		} finally {
			lastPushAt = Date.now()
		}
	})
	// Keep the chain alive even if one push fails.
	pushChain = run.then(
		() => {},
		() => {},
	)
	return run
}

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
 * Classic PATs expose scopes on `X-OAuth-Scopes`. Fine-grained PATs usually do
 * not, so we treat an absent/empty list as "unknown" and attempt workflow sync.
 */
async function getTokenWorkflowAccess() {
	try {
		const response = await fetch('https://api.github.com/user', {
			headers: {
				Accept: 'application/vnd.github.v3+json',
				Authorization: `Bearer ${GITHUB_TOKEN}`,
				'User-Agent': 'epicshop-update-action',
			},
		})
		const scopes = parseOAuthScopes(response.headers.get('x-oauth-scopes'))
		const canUpdateWorkflows = canUpdateWorkflowFiles(scopes)
		return { scopes, canUpdateWorkflows }
	} catch (error) {
		console.warn(
			`⚠️  Could not inspect token scopes (${error.message}); will attempt workflow sync`,
		)
		return { scopes: null, canUpdateWorkflows: true }
	}
}

/**
 * Fetch available workshops from GitHub (epicweb-dev org with 'workshop' topic)
 */
async function fetchAvailableWorkshops() {
	// Note: `archived:false` is supported by GitHub search.
	const baseUrl = `https://api.github.com/search/repositories?q=topic:workshop+org:${GITHUB_ORG}+archived:false&sort=updated&order=desc`
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
			throw new Error(
				`Failed to fetch workshops from GitHub: ${response.status}`,
			)
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

async function fetchAdditionalWorkshops(workshops) {
	const seen = new Set(workshops.map((workshop) => workshop.name))
	const additionalWorkshops = []

	for (const repoName of ADDITIONAL_WORKSHOP_REPOS) {
		if (seen.has(repoName)) continue

		const response = await fetch(
			`https://api.github.com/repos/${GITHUB_ORG}/${repoName}`,
			{
				headers: {
					Accept: 'application/vnd.github.v3+json',
					Authorization: `Bearer ${GITHUB_TOKEN}`,
					'User-Agent': 'epicshop-update-action',
				},
			},
		)

		if (!response.ok) {
			throw new Error(
				`Failed to fetch additional workshop ${repoName}: ${response.status}`,
			)
		}

		const repo = await response.json()
		if (!repo.archived) {
			additionalWorkshops.push(repo)
		}
	}

	return additionalWorkshops
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

async function getPublishedWorkshopAppNodeRange(version) {
	try {
		const { stdout } = await execa('npm', [
			'show',
			`@epic-web/workshop-app@${version}`,
			'engines.node',
		])
		return stdout.trim()
	} catch (error) {
		console.error(
			`❌ Failed to get @epic-web/workshop-app@${version} node engine:`,
			error.message,
		)
		throw error
	}
}

async function verifyWorkshopAppSupportsTargetNode(version) {
	const nodeRange = await getPublishedWorkshopAppNodeRange(version)
	if (!nodeRange) {
		throw new Error(
			`@epic-web/workshop-app@${version} does not publish an engines.node range`,
		)
	}

	if (!semver.satisfies(TARGET_NODE_VERSION, nodeRange)) {
		throw new Error(
			`@epic-web/workshop-app@${version} supports Node ${nodeRange}, not Node ${TARGET_NODE_VERSION}. Aborting before updating workshops.`,
		)
	}

	console.log(
		`✅ @epic-web/workshop-app@${version} supports Node ${TARGET_NODE_VERSION} (${nodeRange})`,
	)
}

/**
 * Verify that the epicshop package is available on npm registry
 * This helps avoid 404 errors in workshop CI when npm registry replication is delayed
 */
async function verifyPackageAvailability(
	packageName,
	version,
	maxRetries = 20,
) {
	// For scoped packages like @epic-web/workshop-app, extract just the package name part
	const tarballName = packageName.includes('/')
		? packageName.split('/')[1]
		: packageName

	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		try {
			// Use AbortController for proper timeout handling
			const controller = new AbortController()
			const timeoutId = setTimeout(() => controller.abort(), 5000)

			// Use GET instead of HEAD to match what workshop CI does during install
			// npm registry has had inconsistent HEAD responses for scoped packages
			const response = await fetch(
				`https://registry.npmjs.org/${packageName}/-/${tarballName}-${version}.tgz`,
				{
					method: 'GET',
					signal: controller.signal,
				},
			)
			clearTimeout(timeoutId)

			if (response.ok) {
				console.log(`✅ ${packageName}@${version} is available on npm registry`)
				return true
			}
			if (response.status !== 404) {
				console.log(
					`⚠️  Unexpected status ${response.status} when checking ${packageName}@${version}, retrying...`,
				)
			}
		} catch (error) {
			console.log(
				`⚠️  Network error checking ${packageName}@${version}: ${error.message}`,
			)
		}

		if (attempt < maxRetries) {
			const waitSeconds = Math.min(2 ** (attempt - 1), 30)
			console.log(
				`⏳ Package not available yet (attempt ${attempt}/${maxRetries}). Waiting ${waitSeconds}s before retry...`,
			)
			await delay(waitSeconds * 1000)
		}
	}

	// Calculate approximate wait time: sum of exponential backoff + fetch timeouts
	const backoffSum = Array.from({ length: maxRetries - 1 }, (_, i) =>
		Math.min(2 ** i, 30),
	).reduce((a, b) => a + b, 0)
	const totalSeconds = backoffSum + maxRetries * 5
	const totalMinutes = Math.round(totalSeconds / 60)

	console.warn(
		`⚠️  ${packageName}@${version} was not available on npm after ${maxRetries} retries (~${totalMinutes} minute${totalMinutes !== 1 ? 's' : ''}).`,
	)
	console.warn(
		'This may cause workshop CI failures. Consider running the update again later.',
	)
	return false
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

async function getStageableFiles(cwd, filesToStage, repoName) {
	const stageableFiles = []
	for (const file of filesToStage) {
		// check-ignore exits 0 when the file is ignored and 1 when it's not
		const { exitCode } = await execa('git', ['check-ignore', '-q', file], {
			cwd,
			env: getGitEnv(),
			reject: false,
		})
		if (exitCode === 0) {
			console.log(`🙈 ${repoName} - skipping gitignored file: ${file}`)
		} else {
			stageableFiles.push(file)
		}
	}
	return stageableFiles
}

async function pushWithRebaseRetry(cwd, repoName) {
	await withPushStagger(async () => {
		console.log(`⬆️  ${repoName} - pushing changes`)
		try {
			await execa('git', ['push'], {
				cwd,
				env: getGitEnv(),
			})
		} catch (error) {
			// Workflow-scope rejections will not be fixed by rebase.
			if (isWorkflowScopeError(error)) throw error
			await pullRebaseWithFallback(cwd)
			await execa('git', ['push'], {
				cwd,
				env: getGitEnv(),
			})
		}
	})
}

/**
 * Stage, commit, and push a specific set of files. Returns whether a push
 * happened. Callers should keep workflow files in a separate commit so a missing
 * `workflow` PAT scope cannot block package/fly updates.
 */
async function stageCommitAndPush({ cwd, repoName, files, commitMessage }) {
	if (files.length === 0) return { pushed: false }

	console.log(`📝 ${repoName} - staging changes: ${files.join(', ')}`)
	await execa('git', ['add', ...files], {
		cwd,
		env: getGitEnv(),
	})

	const { stdout: diffOutput } = await execa(
		'git',
		['diff', '--cached', '--name-only'],
		{ cwd },
	)
	if (!diffOutput.trim()) {
		return { pushed: false }
	}

	console.log(`💾 ${repoName} - committing changes`)
	await execa('git', ['commit', '-m', commitMessage], {
		cwd,
		env: getGitEnv(),
	})

	await pushWithRebaseRetry(cwd, repoName)
	return { pushed: true }
}

/**
 * Keep workshop deploy workflows aligned with the retrying canonical template.
 */
async function syncDeployWorkflow(workshopDir) {
	const targetPath = path.join(workshopDir, DEPLOY_WORKFLOW_PATH)
	const canonical = await fs.readFile(CANONICAL_DEPLOY_WORKFLOW, 'utf8')
	let current = null
	try {
		current = await fs.readFile(targetPath, 'utf8')
	} catch (error) {
		if (error?.code !== 'ENOENT') throw error
	}

	if (current === canonical) {
		return { changed: false, path: DEPLOY_WORKFLOW_PATH }
	}

	await fs.mkdir(path.dirname(targetPath), { recursive: true })
	await fs.writeFile(targetPath, canonical, 'utf8')
	return { changed: true, path: DEPLOY_WORKFLOW_PATH }
}

/**
 * Lengthen Fly health-check grace periods so cold boots are not raced.
 * App names differ per workshop, so patch in place instead of overwriting.
 */
async function patchFlyHealthGracePeriods(workshopDir) {
	const flyPath = path.join(workshopDir, FLY_CONFIG_PATH)
	let contents
	try {
		contents = await fs.readFile(flyPath, 'utf8')
	} catch (error) {
		if (error?.code === 'ENOENT') {
			return { changed: false, path: FLY_CONFIG_PATH, missing: true }
		}
		throw error
	}

	let section = null
	let httpChecks = 0
	let tcpChecks = 0
	const next = contents
		.split('\n')
		.map((line) => {
			const trimmed = line.trim()
			if (trimmed === 'http_checks:') {
				section = 'http'
				return line
			}
			if (trimmed === 'tcp_checks:') {
				section = 'tcp'
				return line
			}
			// Leave the current checks block when indentation returns to the
			// services list / top-level keys.
			if (
				section &&
				trimmed &&
				!line.startsWith(' ') &&
				!line.startsWith('\t')
			) {
				section = null
			} else if (
				section &&
				/^[A-Za-z_][\w-]*:\s*$/.test(trimmed) &&
				!trimmed.endsWith('checks:')
			) {
				const indent = line.match(/^\s*/)?.[0].length ?? 0
				if (indent <= 4) section = null
			}

			if (section && /^\s*grace_period:\s*\S+\s*$/.test(line)) {
				if (section === 'http') {
					httpChecks += 1
					return line.replace(/grace_period:\s*\S+/, 'grace_period: 60s')
				}
				tcpChecks += 1
				return line.replace(/grace_period:\s*\S+/, 'grace_period: 30s')
			}
			return line
		})
		.join('\n')

	if (next === contents) {
		return { changed: false, path: FLY_CONFIG_PATH, httpChecks, tcpChecks }
	}

	await fs.writeFile(flyPath, next, 'utf8')
	return { changed: true, path: FLY_CONFIG_PATH, httpChecks, tcpChecks }
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
async function updateWorkshopRepo(
	repo,
	version,
	{ syncWorkflows = true } = {},
) {
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

		// Configure sparse checkout in non-cone mode to allow file-level patterns
		// This lets us checkout only specific files (like package.json) from workspace dirs.
		// Include deploy workflow + fly config so mass updates can harden them too.
		await execa(
			'git',
			[
				'sparse-checkout',
				'set',
				'--no-cone',
				'/*',
				'epicshop/',
				'.github/workflows/',
			],
			{ cwd: tempDir, env: getGitEnv() },
		)

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

		console.log(
			`🛠️  ${repoName} - syncing deploy workflow and Fly health grace`,
		)
		let workflowSync = { changed: false, path: DEPLOY_WORKFLOW_PATH }
		if (syncWorkflows) {
			workflowSync = await syncDeployWorkflow(tempDir)
			if (workflowSync.changed) {
				console.log(`🛠️  ${repoName} - updated ${workflowSync.path}`)
			}
		} else {
			console.log(
				`⏭️  ${repoName} - skipping ${DEPLOY_WORKFLOW_PATH} sync (token lacks workflow scope)`,
			)
		}
		const flyPatch = await patchFlyHealthGracePeriods(tempDir)
		if (flyPatch.changed) {
			console.log(
				`🛠️  ${repoName} - updated ${flyPatch.path} health grace periods`,
			)
		}

		if (!changed && !workflowSync.changed && !flyPatch.changed) {
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

		// Check if any install directory has workspaces - if so, we need to add
		// workspace package.json files to sparse checkout so npm can resolve them
		for (const installDir of installDirs) {
			const pkgJsonPath = path.join(installDir, 'package.json')
			try {
				const pkgJson = JSON.parse(await fs.readFile(pkgJsonPath, 'utf8'))
				if (pkgJson.workspaces) {
					const workspacePatterns = Array.isArray(pkgJson.workspaces)
						? pkgJson.workspaces
						: pkgJson.workspaces.packages || []
					console.log(
						`📦 ${repoName} - workspaces detected: ${JSON.stringify(workspacePatterns)}`,
					)

					// In non-cone mode, sparse-checkout uses gitignore-style patterns.
					// We add patterns for package.json files in each workspace directory.
					const sparsePatterns = workspacePatterns.map(
						(pattern) => `${pattern}/package.json`,
					)
					console.log(
						`📦 ${repoName} - adding sparse patterns: ${JSON.stringify(sparsePatterns)}`,
					)

					// Read current sparse-checkout patterns and append new ones
					const sparseCheckoutFile = path.join(
						tempDir,
						'.git',
						'info',
						'sparse-checkout',
					)
					const currentPatterns = await fs.readFile(sparseCheckoutFile, 'utf8')
					const newPatterns =
						currentPatterns.trim() + '\n' + sparsePatterns.join('\n') + '\n'
					await fs.writeFile(sparseCheckoutFile, newPatterns, 'utf8')

					// Re-apply sparse checkout to fetch the new files
					await execa('git', ['read-tree', '-mu', 'HEAD'], {
						cwd: tempDir,
						env: getGitEnv(),
					})

					// Verify checkout - count how many workspace package.json files exist
					const { stdout: checkedOutFiles } = await execa(
						'git',
						['ls-files', '--', ...sparsePatterns],
						{ cwd: tempDir, env: getGitEnv() },
					)
					const fileCount = checkedOutFiles
						? checkedOutFiles.split('\n').filter(Boolean).length
						: 0
					console.log(
						`📦 ${repoName} - checked out ${fileCount} workspace package.json files`,
					)
					if (fileCount > 0 && fileCount <= 20) {
						console.log(
							`      Files: ${checkedOutFiles.split('\n').filter(Boolean).join(', ')}`,
						)
					}
					break
				}
			} catch (error) {
				console.log(
					`⚠️  ${repoName} - error checking workspaces: ${error.message}`,
				)
			}
		}

		for (const installDir of installDirs) {
			const rel = path.relative(tempDir, installDir).replace(/\\/g, '/')
			console.log(`📦 ${repoName} - running npm install in ${rel || 'root'}`)
			try {
				const { stderr } = await execa('npm', ['install', '--ignore-scripts'], {
					cwd: installDir,
					env: getGitEnv(),
				})
				if (stderr) {
					console.log(`📦 ${repoName} - npm install stderr:\n${stderr}`)
				}
			} catch (error) {
				// If npm install fails, log the error details
				console.log(
					`⚠️  ${repoName} - npm install failed in ${rel || 'root'}: ${error.message}`,
				)
				if (error.stderr) {
					console.log(`      stderr: ${error.stderr}`)
				}
			}
		}

		// Stage package files, deploy workflow, and fly config when present.
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

				// Log workspace packages in the lock file
				try {
					const lockContents = await fs.readFile(lockPathFull, 'utf8')
					const lockJson = JSON.parse(lockContents)
					const workspacePackages = Object.keys(lockJson.packages || {}).filter(
						(key) =>
							key.startsWith('exercises/') ||
							key.startsWith('extra/') ||
							key.startsWith('example/') ||
							key.startsWith('examples/'),
					)
					console.log(
						`📦 ${repoName} - package-lock.json contains ${workspacePackages.length} workspace package entries`,
					)
					if (workspacePackages.length > 0 && workspacePackages.length <= 10) {
						console.log(`      Entries: ${workspacePackages.join(', ')}`)
					} else if (workspacePackages.length > 10) {
						console.log(
							`      First 10: ${workspacePackages.slice(0, 10).join(', ')}...`,
						)
					}
				} catch (lockError) {
					console.log(
						`⚠️  ${repoName} - could not parse lock file: ${lockError.message}`,
					)
				}
			} catch {
				// File doesn't exist, skip
			}
		}
		if (workflowSync.changed) filesToStage.push(DEPLOY_WORKFLOW_PATH)
		if (flyPatch.changed) filesToStage.push(FLY_CONFIG_PATH)

		// Some workshop repos gitignore files we'd otherwise stage (e.g.
		// epicshop/package-lock.json) and `git add` fails on ignored files.
		const stageableFiles = await getStageableFiles(
			tempDir,
			filesToStage,
			repoName,
		)
		const { nonWorkflowFiles, workflowFiles } =
			partitionFilesByWorkflow(stageableFiles)

		let pushedAnything = false
		let workflowWarning = null

		// Push package/fly updates first so a missing `workflow` PAT scope cannot
		// block the primary version bump.
		const nonWorkflowCommitMessage = changed
			? 'chore: update epicshop'
			: 'chore: harden fly health checks'
		const nonWorkflowPush = await stageCommitAndPush({
			cwd: tempDir,
			repoName,
			files: nonWorkflowFiles,
			commitMessage: nonWorkflowCommitMessage,
		})
		pushedAnything = pushedAnything || nonWorkflowPush.pushed

		if (workflowFiles.length > 0) {
			try {
				const workflowPush = await stageCommitAndPush({
					cwd: tempDir,
					repoName,
					files: workflowFiles,
					commitMessage: 'chore: harden fly deploy workflow',
				})
				pushedAnything = pushedAnything || workflowPush.pushed
			} catch (error) {
				if (!isWorkflowScopeError(error)) throw error
				workflowWarning = workflowScopeHint()
				console.error(
					`⚠️  ${repoName} - could not push ${DEPLOY_WORKFLOW_PATH}: token lacks workflow scope`,
				)
				console.error(`   ${workflowWarning}`)
			}
		}

		if (!pushedAnything) {
			if (workflowWarning) {
				console.log(
					`⚠️  ${repoName} - package/fly already current; workflow sync blocked by token scopes`,
				)
				return {
					repo: repoName,
					status: 'workflow-sync-failed',
					warning: workflowWarning,
				}
			}
			console.log(`🟢 ${repoName} - no changes to commit`)
			return { repo: repoName, status: 'no-changes' }
		}

		if (workflowWarning) {
			console.log(
				`✅ ${repoName} - updated package/fly changes; workflow sync skipped`,
			)
			return {
				repo: repoName,
				status: 'updated',
				warning: workflowWarning,
			}
		}

		console.log(`✅ ${repoName} - updated successfully`)
		return { repo: repoName, status: 'updated' }
	} catch (error) {
		console.error(`❌ ${repoName} - failed:`, error.message)
		if (error.all) {
			console.error(error.all)
		}
		const message = String(error?.message ?? error)
		let authHint = ''
		if (isWorkflowScopeError(error)) {
			authHint = ` (${workflowScopeHint()})`
		} else if (
			message.includes('Authentication failed') ||
			message.includes('could not read Password') ||
			message.includes('terminal prompts disabled') ||
			message.includes('403')
		) {
			authHint =
				' (auth issue: ensure WORKSHOP_UPDATE_TOKEN is a PAT with write access to these repos)'
		}
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
		const tokenAccess = await getTokenWorkflowAccess()
		const syncWorkflows = tokenAccess.canUpdateWorkflows
		if (tokenAccess.scopes) {
			console.log(
				`🔐 Token scopes: ${tokenAccess.scopes.join(', ') || '(none)'}`,
			)
		} else {
			console.log(
				'🔐 Token scopes: unknown (fine-grained PAT or header unavailable)',
			)
		}
		if (!syncWorkflows) {
			console.warn(
				`⚠️  Token cannot update GitHub Actions workflow files. Skipping ${DEPLOY_WORKFLOW_PATH} sync.`,
			)
			console.warn(`   ${workflowScopeHint()}`)
			console.warn(
				'   Package.json and fly.yaml updates will still proceed in a separate commit.',
			)
		}

		console.log('🔍 Fetching workshop repositories from GitHub...')
		const workshops = await fetchAvailableWorkshops()
		workshops.push(...(await fetchAdditionalWorkshops(workshops)))

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
		await verifyWorkshopAppSupportsTargetNode(version)

		// Verify that both epicshop and workshop-app are available on npm
		// before pushing updates to workshops to avoid 404 errors in workshop CI
		console.log('\n🔐 Verifying package availability on npm registry...')
		const epicshopAvailable = await verifyPackageAvailability(
			'epicshop',
			version,
		)

		// If epicshop is not available, skip workshop-app check to avoid wasting time
		let workshopAppAvailable = false
		if (epicshopAvailable) {
			workshopAppAvailable = await verifyPackageAvailability(
				'@epic-web/workshop-app',
				version,
			)
		} else {
			console.log(
				'⏭️  Skipping @epic-web/workshop-app verification since epicshop is unavailable',
			)
		}

		if (!epicshopAvailable || !workshopAppAvailable) {
			console.error(
				'\n❌ Required packages not available on npm. Aborting to prevent workshop CI failures.',
			)
			console.error('   Please try running this script again in a few minutes.')
			process.exit(1)
		}

		console.log(
			`\n🚀 Processing ${workshops.length} repos with concurrency ${CONCURRENCY} (push stagger ${Math.round(PUSH_STAGGER_MS / 1000)}s)\n`,
		)

		// Process repos in parallel with a simple concurrency pool (no extra deps)
		const results = []
		const queue = [...workshops]
		const workers = Array.from({ length: CONCURRENCY }, async () => {
			while (queue.length) {
				const repo = queue.shift()
				if (!repo) break
				results.push(await updateWorkshopRepo(repo, version, { syncWorkflows }))
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
		const workflowSyncFailed = results.filter(
			(r) => r.status === 'workflow-sync-failed',
		)
		const failed = results.filter((r) => r.status === 'failed')
		const warnings = results.filter((r) => r.warning)

		console.log('\n' + '='.repeat(50))
		console.log('📊 Summary:')
		console.log(`  ✅ Updated: ${updated.length}`)
		console.log(`  🟢 Skipped (up to date): ${skipped.length}`)
		if (workflowSyncFailed.length > 0) {
			console.log(`  ⚠️  Workflow sync blocked: ${workflowSyncFailed.length}`)
		}
		console.log(`  ❌ Failed: ${failed.length}`)

		if (failed.length > 0) {
			console.log('\nFailed repositories:')
			failed.forEach((r) => {
				console.log(`  - ${r.repo}: ${r.error}`)
			})
		}

		if (warnings.length > 0 || !syncWorkflows) {
			console.log('\n⚠️  Deploy workflow sync note:')
			if (!syncWorkflows) {
				console.log(
					`  - Skipped ${DEPLOY_WORKFLOW_PATH} sync because the token lacks workflow access`,
				)
			}
			if (warnings.length > 0) {
				console.log(
					`  - ${warnings.length} repo(s) could not push workflow file changes`,
				)
			}
			console.log(`  - ${workflowScopeHint()}`)
		}

		console.log('\n✅ All workshops processed')

		// Hard failures still fail the job. Missing workflow scope is surfaced in
		// logs above but must not block package/fly updates from succeeding.
		if (failed.length > 0) {
			process.exit(1)
		}
	} catch (error) {
		console.error('❌ Fatal error:', error.message)
		process.exit(1)
	}
}

await main()
