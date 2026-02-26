import { type Dirent } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'

import { compileMdx } from '@epic-web/workshop-utils/compile-mdx.server'
import { getErrorMessage } from '@epic-web/workshop-utils/utils'
import chalk from 'chalk'
import { pathExists } from '../../utils/filesystem.js'
import {
	collectStepDirectories,
	formatProductLessonUrl,
	fetchRemoteWorkshopLessons,
	isDirectory,
	resolveMdxFile,
	stripEpicAiSlugSuffix,
} from './workshop-content-utils.js'

type IssueLevel = 'error' | 'warning'

type Issue = {
	level: IssueLevel
	code: string
	message: string
	file?: string
}

export type LaunchReadinessOptions = {
	/**
	 * Defaults to `process.env.EPICSHOP_CONTEXT_CWD ?? process.cwd()`.
	 * Primarily useful for tests.
	 */
	workshopRoot?: string
	silent?: boolean
	/**
	 * Skip the remote "product lessons" check (only run local checks).
	 */
	skipRemote?: boolean
	/**
	 * Skip checking that EpicVideo urls respond 200 to HEAD.
	 */
	skipHead?: boolean
}

export type LaunchReadinessResult = {
	success: boolean
	message?: string
	error?: Error
}

type VideoCheckFile = {
	kind:
		| 'workshop-intro'
		| 'workshop-wrap-up'
		| 'exercise-intro'
		| 'exercise-summary'
		| 'step-problem'
		| 'step-solution'
	fullPath: string
	relativePath: string
}

type ContentCheckFile = {
	fullPath: string
	relativePath: string
}

function normalizeHost(host: string) {
	return host.toLowerCase().replace(/^www\./, '')
}

function parseEpicWorkshopSlugFromEmbedUrl(urlString: string): string | null {
	const parseSegments = (segments: Array<string>) => {
		// Expected: /workshops/<workshopSlug>/...
		if (segments[0] !== 'workshops') return null
		const workshopSlug = segments[1] ?? null
		return workshopSlug ? stripEpicAiSlugSuffix(workshopSlug) : null
	}

	try {
		const url = new URL(urlString)
		const segments = url.pathname.split('/').filter(Boolean)
		return parseSegments(segments)
	} catch {
		// Fall back to naive parsing (best-effort).
		const withoutHash = urlString.split('#')[0] ?? urlString
		const withoutQuery = withoutHash.split('?')[0] ?? withoutHash
		const segments = withoutQuery.split('/').filter(Boolean)
		return parseSegments(segments)
	}
}

function parseEpicLessonSlugFromEmbedUrl(urlString: string): string | null {
	const parseSegments = (segments: Array<string>) => {
		if (segments.length === 0) return null
		const last = segments.at(-1) ?? null
		if (!last) return null
		if (last === 'problem' || last === 'solution' || last === 'embed') {
			const slug = segments.at(-2) ?? null
			return slug ? stripEpicAiSlugSuffix(slug) : null
		}
		return stripEpicAiSlugSuffix(last)
	}

	try {
		const url = new URL(urlString)
		const segments = url.pathname.split('/').filter(Boolean)
		return parseSegments(segments)
	} catch {
		// Fall back to naive parsing (best-effort).
		const withoutHash = urlString.split('#')[0] ?? urlString
		const withoutQuery = withoutHash.split('?')[0] ?? withoutHash
		const segments = withoutQuery.split('/').filter(Boolean)
		return parseSegments(segments)
	}
}

function formatIssue(issue: Issue, workshopRoot: string) {
	const icon = issue.level === 'error' ? chalk.red('❌') : chalk.yellow('⚠️ ')
	const filePart = issue.file
		? chalk.gray(` (${path.relative(workshopRoot, issue.file)})`)
		: ''
	return `${icon} ${issue.message}${filePart}`
}

async function buildExpectedFiles({
	workshopRoot,
	exerciseDirName,
}: {
	workshopRoot: string
	exerciseDirName: string
}): Promise<{
	files: Array<VideoCheckFile>
	contentFiles: Array<ContentCheckFile>
	issues: Array<Issue>
}> {
	const issues: Array<Issue> = []
	const files: Array<VideoCheckFile> = []
	const contentFiles: Array<ContentCheckFile> = []

	const exerciseRoot = path.join(workshopRoot, 'exercises', exerciseDirName)
	const exerciseIntro = await resolveMdxFile(exerciseRoot, 'README')
	const exerciseSummary = await resolveMdxFile(exerciseRoot, 'FINISHED')

	if (!exerciseIntro) {
		issues.push({
			level: 'error',
			code: 'missing-exercise-readme',
			message: `Missing exercise intro file (expected README.mdx)`,
			file: path.join(exerciseRoot, 'README.mdx'),
		})
	} else {
		files.push({
			kind: 'exercise-intro',
			fullPath: exerciseIntro,
			relativePath: path.relative(workshopRoot, exerciseIntro),
		})
		contentFiles.push({
			fullPath: exerciseIntro,
			relativePath: path.relative(workshopRoot, exerciseIntro),
		})
	}

	if (!exerciseSummary) {
		issues.push({
			level: 'error',
			code: 'missing-exercise-finished',
			message: `Missing exercise summary file (expected FINISHED.mdx)`,
			file: path.join(exerciseRoot, 'FINISHED.mdx'),
		})
	} else {
		files.push({
			kind: 'exercise-summary',
			fullPath: exerciseSummary,
			relativePath: path.relative(workshopRoot, exerciseSummary),
		})
		contentFiles.push({
			fullPath: exerciseSummary,
			relativePath: path.relative(workshopRoot, exerciseSummary),
		})
	}

	let entries: Array<Dirent> = []
	try {
		entries = await fs.readdir(exerciseRoot, { withFileTypes: true })
	} catch (error) {
		issues.push({
			level: 'error',
			code: 'exercise-readdir-failed',
			message: `Failed to read exercise directory contents: ${getErrorMessage(
				error,
			)}`,
			file: exerciseRoot,
		})
		return { files, contentFiles, issues }
	}
	const stepsByNumber = collectStepDirectories(entries, exerciseRoot)

	if (stepsByNumber.size === 0) {
		issues.push({
			level: 'warning',
			code: 'no-steps-found',
			message:
				'No step app directories found in this exercise (expected folders like "01.problem" and "01.solution")',
			file: exerciseRoot,
		})
	}

	for (const [stepNumber, dirs] of [...stepsByNumber.entries()].sort(
		(a, b) => a[0] - b[0],
	)) {
		if (dirs.problems.length === 0) {
			issues.push({
				level: 'error',
				code: 'missing-step-problem-dir',
				message: `Missing problem app directory for step ${stepNumber}`,
				file: exerciseRoot,
			})
		}
		if (dirs.solutions.length === 0) {
			issues.push({
				level: 'error',
				code: 'missing-step-solution-dir',
				message: `Missing solution app directory for step ${stepNumber}`,
				file: exerciseRoot,
			})
		}
		if (dirs.problems.length > 1) {
			issues.push({
				level: 'warning',
				code: 'multiple-step-problem-dirs',
				message: `Multiple problem app directories found for step ${stepNumber}`,
				file: exerciseRoot,
			})
		}
		if (dirs.solutions.length > 1) {
			issues.push({
				level: 'warning',
				code: 'multiple-step-solution-dirs',
				message: `Multiple solution app directories found for step ${stepNumber}`,
				file: exerciseRoot,
			})
		}

		for (const problemDir of dirs.problems) {
			const problemReadme = await resolveMdxFile(problemDir, 'README')
			if (!problemReadme) {
				issues.push({
					level: 'error',
					code: 'missing-step-problem-readme',
					message: `Missing step problem README.mdx for step ${stepNumber}`,
					file: path.join(problemDir, 'README.mdx'),
				})
			} else {
				files.push({
					kind: 'step-problem',
					fullPath: problemReadme,
					relativePath: path.relative(workshopRoot, problemReadme),
				})
				contentFiles.push({
					fullPath: problemReadme,
					relativePath: path.relative(workshopRoot, problemReadme),
				})
			}
		}

		for (const solutionDir of dirs.solutions) {
			const solutionReadme = await resolveMdxFile(solutionDir, 'README')
			if (!solutionReadme) {
				issues.push({
					level: 'error',
					code: 'missing-step-solution-readme',
					message: `Missing step solution README.mdx for step ${stepNumber}`,
					file: path.join(solutionDir, 'README.mdx'),
				})
			} else {
				files.push({
					kind: 'step-solution',
					fullPath: solutionReadme,
					relativePath: path.relative(workshopRoot, solutionReadme),
				})
				contentFiles.push({
					fullPath: solutionReadme,
					relativePath: path.relative(workshopRoot, solutionReadme),
				})
			}
		}
	}

	return { files, contentFiles, issues }
}

async function checkMinContentLength({
	fullPath,
	minChars,
}: {
	fullPath: string
	minChars: number
}): Promise<Issue | null> {
	try {
		const raw = await fs.readFile(fullPath, 'utf8')
		const trimmed = raw.trim()
		if (trimmed.length >= minChars) return null
		return {
			level: 'error',
			code: 'mdx-too-short',
			message: `File content too short (<${minChars} chars after trimming)`,
			file: fullPath,
		}
	} catch (error) {
		return {
			level: 'error',
			code: 'mdx-read-failed',
			message: `Failed to read file content: ${getErrorMessage(error)}`,
			file: fullPath,
		}
	}
}

async function asyncPool<TItem, TResult>(
	limit: number,
	items: Array<TItem>,
	mapper: (item: TItem) => Promise<TResult>,
): Promise<Array<TResult>> {
	const results: Array<TResult> = []
	let nextIndex = 0
	const workers = Array.from({ length: Math.max(1, limit) }, async () => {
		while (true) {
			const currentIndex = nextIndex++
			if (currentIndex >= items.length) return
			results[currentIndex] = await mapper(items[currentIndex]!)
		}
	})
	await Promise.all(workers)
	return results
}

async function checkEpicVideoUrlsHead({
	embedOccurrences,
}: {
	embedOccurrences: Map<string, Set<string>>
}): Promise<Array<Issue>> {
	const urls = [...embedOccurrences.keys()]
	const issues: Array<Issue> = []

	await asyncPool(8, urls, async (urlString) => {
		const usedBy = embedOccurrences.get(urlString) ?? new Set<string>()
		const timeout = AbortSignal.timeout(10_000)

		const headResult = await fetch(urlString, {
			method: 'HEAD',
			redirect: 'follow',
			signal: timeout,
		}).catch((error) => ({ error }) as const)

		if ('error' in headResult) {
			for (const file of usedBy) {
				issues.push({
					level: 'error',
					code: 'epic-video-head-failed',
					message: `EpicVideo url HEAD request failed: ${getErrorMessage(
						headResult.error,
					)} (${urlString})`,
					file,
				})
			}
			return null
		}

		if (headResult.status === 200) return null

		let extra = ''
		if (headResult.status === 405) {
			// Some origins disable HEAD. Try a small GET to provide actionable diagnostics.
			const getTimeout = AbortSignal.timeout(10_000)
			const getResult = await fetch(urlString, {
				method: 'GET',
				headers: { range: 'bytes=0-0' },
				redirect: 'follow',
				signal: getTimeout,
			}).catch((error) => ({ error }) as const)
			if ('error' in getResult) {
				extra = ` (GET fallback failed: ${getErrorMessage(getResult.error)})`
			} else {
				extra = ` (GET fallback status: ${getResult.status} ${getResult.statusText})`
			}
		}

		for (const file of usedBy) {
			issues.push({
				level: 'error',
				code: 'epic-video-head-non-200',
				message: `EpicVideo url HEAD status was ${headResult.status} ${headResult.statusText} (expected 200): ${urlString}${extra}`,
				file,
			})
		}

		return null
	})

	return issues
}

export async function launchReadiness(
	options: LaunchReadinessOptions = {},
): Promise<LaunchReadinessResult> {
	const workshopRoot = path.resolve(
		options.workshopRoot ?? process.env.EPICSHOP_CONTEXT_CWD ?? process.cwd(),
	)
	process.env.EPICSHOP_CONTEXT_CWD = workshopRoot

	const { silent = false, skipRemote = false, skipHead = false } = options

	const issues: Array<Issue> = []

	// ----------------------------
	// 1) Configuration validation
	// ----------------------------
	let productHost: string | null = null
	let productSlug: string | null = null
	const packageJsonPath = path.join(workshopRoot, 'package.json')
	let rawPackageJson: any = null
	let rawEpicshop: any = null
	let rawProduct: any = null

	try {
		const raw = await fs.readFile(packageJsonPath, 'utf8')
		rawPackageJson = JSON.parse(raw)
		rawEpicshop =
			rawPackageJson && typeof rawPackageJson === 'object'
				? rawPackageJson.epicshop
				: null
		rawProduct =
			rawEpicshop && typeof rawEpicshop === 'object'
				? rawEpicshop.product
				: null
	} catch (error) {
		issues.push({
			level: 'error',
			code: 'invalid-package-json',
			message: `Failed to read/parse package.json: ${getErrorMessage(error)}`,
			file: packageJsonPath,
		})
	}

	if (!rawEpicshop || typeof rawEpicshop !== 'object') {
		issues.push({
			level: 'error',
			code: 'missing-epicshop-config',
			message: 'Missing `epicshop` configuration in package.json',
			file: packageJsonPath,
		})
	}

	if (!rawProduct || typeof rawProduct !== 'object') {
		issues.push({
			level: 'error',
			code: 'missing-epicshop-product-config',
			message: 'Missing `epicshop.product` configuration in package.json',
			file: packageJsonPath,
		})
	}

	productHost =
		typeof rawProduct?.host === 'string' && rawProduct.host.trim()
			? rawProduct.host.trim()
			: null
	productSlug =
		typeof rawProduct?.slug === 'string' && rawProduct.slug.trim()
			? rawProduct.slug.trim()
			: null

	if (!productHost) {
		issues.push({
			level: 'error',
			code: 'missing-product-host',
			message:
				'Missing `epicshop.product.host` in package.json (required for launch readiness)',
			file: packageJsonPath,
		})
	} else if (/^https?:\/\//i.test(productHost)) {
		issues.push({
			level: 'error',
			code: 'invalid-product-host',
			message:
				'`epicshop.product.host` should be a host (no protocol), e.g. "www.epicweb.dev"',
			file: packageJsonPath,
		})
		productHost = null
	} else if (productHost.includes('/')) {
		issues.push({
			level: 'error',
			code: 'invalid-product-host',
			message:
				'`epicshop.product.host` should not include a path, e.g. "www.epicweb.dev"',
			file: packageJsonPath,
		})
		productHost = null
	}

	if (!productSlug) {
		issues.push({
			level: 'error',
			code: 'missing-product-slug',
			message:
				'Missing `epicshop.product.slug` in package.json (required for launch readiness)',
			file: packageJsonPath,
		})
	} else if (!/^[a-z0-9-]+$/i.test(productSlug)) {
		issues.push({
			level: 'warning',
			code: 'suspicious-product-slug',
			message:
				'`epicshop.product.slug` contains unusual characters; expected something like "full-stack-foundations"',
			file: packageJsonPath,
		})
	}

	const workshopTitle =
		typeof rawEpicshop?.title === 'string' ? rawEpicshop.title.trim() : ''
	if (!workshopTitle) {
		issues.push({
			level: 'error',
			code: 'missing-workshop-title',
			message: 'Missing `epicshop.title` in package.json',
			file: packageJsonPath,
		})
	}

	const githubRepo =
		typeof rawEpicshop?.githubRepo === 'string'
			? rawEpicshop.githubRepo.trim()
			: ''
	const githubRoot =
		typeof rawEpicshop?.githubRoot === 'string'
			? rawEpicshop.githubRoot.trim()
			: ''
	if (!githubRepo && !githubRoot) {
		issues.push({
			level: 'error',
			code: 'missing-github-root',
			message:
				'Missing `epicshop.githubRoot` (or `epicshop.githubRepo`) in package.json',
			file: packageJsonPath,
		})
	}

	const discordChannelId =
		typeof rawProduct?.discordChannelId === 'string'
			? rawProduct.discordChannelId.trim()
			: ''
	if (!discordChannelId) {
		issues.push({
			level: 'warning',
			code: 'missing-discord-channel-id',
			message:
				'Missing `epicshop.product.discordChannelId` (chat UI will be disabled)',
			file: packageJsonPath,
		})
	}

	const discordTagsCount = Array.isArray(rawProduct?.discordTags)
		? rawProduct.discordTags.filter((tag: unknown) => {
				return typeof tag === 'string' && tag.trim().length > 0
			}).length
		: 0
	if (discordTagsCount === 0) {
		issues.push({
			level: 'warning',
			code: 'missing-discord-tags',
			message:
				'Missing `epicshop.product.discordTags` (chat UI will be disabled or untagged)',
			file: packageJsonPath,
		})
	}

	// --------------------------------------
	// 2) Local video coverage (launch check)
	// --------------------------------------
	const exercisesRoot = path.join(workshopRoot, 'exercises')
	if (!(await isDirectory(exercisesRoot))) {
		issues.push({
			level: 'error',
			code: 'missing-exercises-dir',
			message: 'Missing `exercises/` directory (required for a workshop)',
			file: exercisesRoot,
		})
	}

	const filesToCheck: Array<VideoCheckFile> = []
	const contentFilesToCheck: Array<ContentCheckFile> = []

	// Workshop intro + wrap-up (launch doc)
	const workshopIntro = await resolveMdxFile(exercisesRoot, 'README')
	const workshopWrapUp = await resolveMdxFile(exercisesRoot, 'FINISHED')

	if (!workshopIntro) {
		issues.push({
			level: 'error',
			code: 'missing-workshop-readme',
			message: 'Missing workshop intro file `exercises/README.mdx`',
			file: path.join(exercisesRoot, 'README.mdx'),
		})
	} else {
		filesToCheck.push({
			kind: 'workshop-intro',
			fullPath: workshopIntro,
			relativePath: path.relative(workshopRoot, workshopIntro),
		})
		contentFilesToCheck.push({
			fullPath: workshopIntro,
			relativePath: path.relative(workshopRoot, workshopIntro),
		})
	}

	if (!workshopWrapUp) {
		issues.push({
			level: 'error',
			code: 'missing-workshop-finished',
			message: 'Missing workshop wrap-up file `exercises/FINISHED.mdx`',
			file: path.join(exercisesRoot, 'FINISHED.mdx'),
		})
	} else {
		filesToCheck.push({
			kind: 'workshop-wrap-up',
			fullPath: workshopWrapUp,
			relativePath: path.relative(workshopRoot, workshopWrapUp),
		})
		contentFilesToCheck.push({
			fullPath: workshopWrapUp,
			relativePath: path.relative(workshopRoot, workshopWrapUp),
		})
	}

	// Exercise + step files
	let exerciseDirNames: Array<string> = []
	if (await isDirectory(exercisesRoot)) {
		const exerciseEntries = await fs.readdir(exercisesRoot, {
			withFileTypes: true,
		})
		exerciseDirNames = exerciseEntries
			.filter((e) => e.isDirectory() && /^\d+\./.test(e.name))
			.map((e) => e.name)
			.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
	}

	if (exerciseDirNames.length === 0) {
		issues.push({
			level: 'warning',
			code: 'no-exercises-found',
			message:
				'No exercise directories found (expected folders like "01.my-exercise" under exercises/)',
			file: exercisesRoot,
		})
	}

	for (const exerciseDirName of exerciseDirNames) {
		const {
			files,
			contentFiles,
			issues: fileIssues,
		} = await buildExpectedFiles({
			workshopRoot,
			exerciseDirName,
		})
		issues.push(...fileIssues)
		filesToCheck.push(...files)
		contentFilesToCheck.push(...contentFiles)
	}

	// --------------------------------------
	// 2a) MDX content exists and is non-trivial
	// --------------------------------------
	{
		const minChars = 30
		const uniqueContentFiles = new Map<string, ContentCheckFile>()
		for (const file of contentFilesToCheck) {
			uniqueContentFiles.set(file.fullPath, file)
		}
		for (const file of uniqueContentFiles.values()) {
			if (!(await pathExists(file.fullPath))) continue
			const issue = await checkMinContentLength({
				fullPath: file.fullPath,
				minChars,
			})
			if (issue) issues.push(issue)
		}
	}

	const embedOccurrences = new Map<string, Set<string>>() // url -> files

	for (const file of filesToCheck) {
		if (!(await pathExists(file.fullPath))) {
			issues.push({
				level: 'error',
				code: 'missing-file',
				message: `Missing file`,
				file: file.fullPath,
			})
			continue
		}

		try {
			const compiled = await compileMdx(file.fullPath)
			const embeds = compiled.epicVideoEmbeds ?? []

			if (embeds.length === 0) {
				issues.push({
					level: 'error',
					code: 'missing-epic-video-embed',
					message:
						'No <EpicVideo url="..."> embed found (required for launch readiness)',
					file: file.fullPath,
				})
				continue
			}

			for (const embed of embeds) {
				const set = embedOccurrences.get(embed) ?? new Set<string>()
				set.add(file.fullPath)
				embedOccurrences.set(embed, set)
			}
		} catch (error) {
			issues.push({
				level: 'error',
				code: 'mdx-compile-failed',
				message: `Failed to compile MDX: ${getErrorMessage(error)}`,
				file: file.fullPath,
			})
		}
	}

	// Also scan the remaining required MDX files for EpicVideo embeds,
	// but do not require that they include a video.
	{
		const videoFilePaths = new Set(filesToCheck.map((f) => f.fullPath))
		const extraContentFilePaths = new Set(
			contentFilesToCheck
				.map((f) => f.fullPath)
				.filter((p) => !videoFilePaths.has(p)),
		)

		for (const fullPath of extraContentFilePaths) {
			if (!(await pathExists(fullPath))) continue
			try {
				const compiled = await compileMdx(fullPath)
				for (const embed of compiled.epicVideoEmbeds ?? []) {
					const set = embedOccurrences.get(embed) ?? new Set<string>()
					set.add(fullPath)
					embedOccurrences.set(embed, set)
				}
			} catch (error) {
				issues.push({
					level: 'error',
					code: 'mdx-compile-failed',
					message: `Failed to compile MDX: ${getErrorMessage(error)}`,
					file: fullPath,
				})
			}
		}
	}

	// ------------------------------------------------
	// 3) HEAD-check EpicVideo urls
	// ------------------------------------------------
	if (!skipHead) {
		issues.push(...(await checkEpicVideoUrlsHead({ embedOccurrences })))
	}

	// ------------------------------------------------
	// 4) Validate embed URLs match the configured host
	// ------------------------------------------------
	if (productHost && productSlug) {
		const normalizedConfigHost = normalizeHost(productHost)

		for (const [embedUrl, usedBy] of embedOccurrences.entries()) {
			let url: URL
			try {
				url = new URL(embedUrl)
			} catch (error) {
				for (const file of usedBy) {
					issues.push({
						level: 'error',
						code: 'invalid-epic-video-url',
						message: `Invalid EpicVideo url: ${getErrorMessage(error)}`,
						file,
					})
				}
				continue
			}

			const embedHost = normalizeHost(url.host)
			if (embedHost !== normalizedConfigHost) {
				for (const file of usedBy) {
					issues.push({
						level: 'error',
						code: 'epic-video-host-mismatch',
						message: `EpicVideo url host mismatch (expected ${productHost}, got ${url.host})`,
						file,
					})
				}
			}

			const segments = url.pathname.split('/').filter(Boolean)
			// Expected: /workshops/<workshopSlug>/...
			if (segments[0] !== 'workshops') {
				for (const file of usedBy) {
					issues.push({
						level: 'warning',
						code: 'epic-video-url-unexpected-path',
						message:
							'EpicVideo url path does not start with /workshops/... (this may break progress tracking)',
						file,
					})
				}
				continue
			}
			if (segments[1] !== productSlug) {
				for (const file of usedBy) {
					issues.push({
						level: 'error',
						code: 'epic-video-workshop-slug-mismatch',
						message: `EpicVideo url workshop slug mismatch (expected ${productSlug}, got ${segments[1] ?? '(missing)'})`,
						file,
					})
				}
			}
		}
	}

	// -------------------------------------------------------
	// 4) Remote product lesson list vs local embedded videos
	// -------------------------------------------------------
	if (!skipRemote) {
		if (productHost && productSlug) {
			// Only consider embeds that belong to this workshop on the configured host.
			// It's valid for content to include EpicVideo embeds from other workshops/paths.
			const localProductLessonSlugs = new Set<string>()
			const normalizedConfigHost = normalizeHost(productHost)
			for (const embedUrl of embedOccurrences.keys()) {
				const lessonSlug = parseEpicLessonSlugFromEmbedUrl(embedUrl)
				if (!lessonSlug) continue
				const workshopSlug = parseEpicWorkshopSlugFromEmbedUrl(embedUrl)
				if (!workshopSlug || workshopSlug !== productSlug) continue
				try {
					const url = new URL(embedUrl)
					if (normalizeHost(url.host) !== normalizedConfigHost) continue
				} catch {
					// Invalid URLs are reported elsewhere (host/path validation); ignore here.
					continue
				}
				localProductLessonSlugs.add(lessonSlug)
			}

			const remote = await fetchRemoteWorkshopLessons({
				productHost,
				workshopSlug: productSlug,
			})

			if (remote.status === 'error') {
				issues.push({
					level: 'error',
					code: 'remote-product-lessons-unavailable',
					message: remote.message,
				})
			} else {
				const remoteLessons = remote.lessons
					.map((l) => ({
						slug: stripEpicAiSlugSuffix(l.slug),
						sectionSlug: l.sectionSlug
							? stripEpicAiSlugSuffix(l.sectionSlug)
							: null,
					}))
					.filter((l) => l.slug.trim().length > 0)

				// Preserve the first sectionSlug seen for a given lesson slug.
				const remoteLessonBySlug = new Map<
					string,
					{ slug: string; sectionSlug: string | null }
				>()
				for (const l of remoteLessons) {
					if (!remoteLessonBySlug.has(l.slug)) remoteLessonBySlug.set(l.slug, l)
				}

				const remoteLessonSlugs = [...remoteLessonBySlug.keys()]

				if (remoteLessonSlugs.length === 0) {
					issues.push({
						level: 'error',
						code: 'remote-product-lessons-empty',
						message:
							'Product API returned no lessons. Is the workshop published on the product site?',
					})
				}

				const missing = remoteLessonSlugs.filter(
					(slug) => !localProductLessonSlugs.has(slug),
				)
				if (missing.length) {
					const formatted = missing
						.sort()
						.map((slug) => {
							const remoteLesson = remoteLessonBySlug.get(slug)
							return `- ${slug}: ${formatProductLessonUrl({
								productHost,
								productSlug,
								lessonSlug: slug,
								sectionSlug: remoteLesson?.sectionSlug ?? null,
							})}`
						})
						.join('\n')
					issues.push({
						level: 'error',
						code: 'missing-product-videos-in-workshop',
						message: `Missing videos in workshop for product lessons:\n${formatted}`,
					})
				}

				const remoteLessonSlugSet = new Set(remoteLessonSlugs)
				for (const [embedUrl, usedBy] of embedOccurrences.entries()) {
					const lessonSlug = parseEpicLessonSlugFromEmbedUrl(embedUrl)
					if (!lessonSlug) continue
					const workshopSlug = parseEpicWorkshopSlugFromEmbedUrl(embedUrl)
					if (!workshopSlug || workshopSlug !== productSlug) continue
					try {
						const url = new URL(embedUrl)
						if (normalizeHost(url.host) !== normalizedConfigHost) continue
					} catch {
						continue
					}

					if (remoteLessonSlugSet.has(lessonSlug)) continue
					for (const file of usedBy) {
						issues.push({
							level: 'warning',
							code: 'extra-local-videos',
							message: `EpicVideo embed not present in the product lesson list: ${embedUrl}`,
							file,
						})
					}
				}
			}
		}
	}

	const errorCount = issues.filter((i) => i.level === 'error').length
	const warningCount = issues.filter((i) => i.level === 'warning').length
	const success = errorCount === 0

	if (!silent) {
		console.log(chalk.bold.cyan('\n🛠️  Admin: Launch readiness\n'))
		console.log(
			`${success ? chalk.green('✅') : chalk.red('❌')} Result: ${
				success ? chalk.green('PASS') : chalk.red('FAIL')
			}`,
		)
		console.log(
			chalk.gray(
				`(${errorCount} error${errorCount === 1 ? '' : 's'}, ${warningCount} warning${
					warningCount === 1 ? '' : 's'
				})`,
			),
		)
		console.log()

		if (issues.length) {
			for (const issue of issues) {
				console.log(formatIssue(issue, workshopRoot))
			}
			console.log()
		}

		if (!skipRemote && productHost && productSlug) {
			console.log(
				chalk.gray(
					`Remote lesson check: https://${productHost}/api/workshops/${productSlug}`,
				),
			)
			console.log()
		}

		if (!success) {
			console.log(
				chalk.gray(
					`Docs: https://github.com/epicweb-dev/epicshop/blob/main/docs/launch.md`,
				),
			)
			console.log()
		}
	}

	return success
		? { success: true, message: 'Launch readiness checks passed' }
		: {
				success: false,
				message: 'Launch readiness checks failed',
				error: new Error(
					`Launch readiness failed with ${errorCount} error${
						errorCount === 1 ? '' : 's'
					}`,
				),
			}
}
