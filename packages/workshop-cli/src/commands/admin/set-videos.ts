import { type Dirent } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'

import { getAuthInfo } from '@epic-web/workshop-utils/db.server'
import { getErrorMessage } from '@epic-web/workshop-utils/utils'
import chalk from 'chalk'
import { pathExists } from '../../utils/filesystem.js'

type OrderedVideoFile = {
	fullPath: string
	relativePath: string
}

type SetVideosOutcome = 'inserted' | 'updated' | 'unchanged'

type RemoteLesson = {
	slug: string
	sectionSlug: string | null
}

export type SetVideosOptions = {
	/**
	 * Defaults to `process.env.EPICSHOP_CONTEXT_CWD ?? process.cwd()`.
	 * Primarily useful for tests.
	 */
	workshopRoot?: string
	silent?: boolean
	dryRun?: boolean
}

export type SetVideosResult = {
	success: boolean
	message: string
	error?: Error
	inserted: number
	updated: number
	unchanged: number
	warnings: Array<string>
	dryRun: boolean
}

function createFailureResult(
	message: string,
	{ dryRun = false }: { dryRun?: boolean } = {},
): SetVideosResult {
	return {
		success: false,
		message,
		error: new Error(message),
		inserted: 0,
		updated: 0,
		unchanged: 0,
		warnings: [],
		dryRun,
	}
}

function stripEpicAiSlugSuffix(value: string) {
	// EpicAI embeds sometimes include a `~...` suffix in the slug segment.
	return value.replace(/~[^ ]*$/, '')
}

function formatProductLessonUrl({
	productHost,
	productSlug,
	lessonSlug,
	sectionSlug,
}: {
	productHost: string
	productSlug: string
	lessonSlug: string
	sectionSlug: string | null
}) {
	return sectionSlug
		? `https://${productHost}/workshops/${productSlug}/${sectionSlug}/${lessonSlug}`
		: `https://${productHost}/workshops/${productSlug}/${lessonSlug}`
}

async function isDirectory(targetPath: string) {
	try {
		return (await fs.stat(targetPath)).isDirectory()
	} catch {
		return false
	}
}

async function resolveMdxFile(
	dir: string,
	baseName: 'README' | 'FINISHED',
): Promise<string | null> {
	const mdx = path.join(dir, `${baseName}.mdx`)
	if (await pathExists(mdx)) return mdx
	return null
}

async function fetchRemoteWorkshopLessons({
	productHost,
	workshopSlug,
}: {
	productHost: string
	workshopSlug: string
}): Promise<
	| {
			status: 'success'
			lessons: Array<RemoteLesson>
	  }
	| { status: 'error'; message: string }
> {
	const url = `https://${productHost}/api/workshops/${encodeURIComponent(workshopSlug)}`

	const fetchOnce = async (accessToken?: string) => {
		const timeout = AbortSignal.timeout(15_000)
		const headers: Record<string, string> = {}
		if (accessToken) headers.authorization = `Bearer ${accessToken}`
		return fetch(url, { headers, signal: timeout })
	}

	let response: Response | null = null
	try {
		response = await fetchOnce()
	} catch (error) {
		return {
			status: 'error',
			message: `Failed to fetch product workshop data: ${getErrorMessage(error)}`,
		}
	}

	if (response.status === 401 || response.status === 403) {
		const authInfo = await getAuthInfo({ productHost }).catch(() => null)
		const accessToken = authInfo?.tokenSet?.access_token
		if (accessToken) {
			try {
				response = await fetchOnce(accessToken)
			} catch (error) {
				return {
					status: 'error',
					message: `Failed to fetch product workshop data (after auth): ${getErrorMessage(
						error,
					)}`,
				}
			}
		}
	}

	if (!response.ok) {
		const body = await response.text().catch(() => '')
		const hint =
			response.status === 401 || response.status === 403
				? ` (try: npx epicshop auth login ${productHost.replace(/^www\./, '')})`
				: response.status === 404
					? ` (check epicshop.product.host + epicshop.product.slug)`
					: ''
		return {
			status: 'error',
			message: `Product API request failed: ${response.status} ${response.statusText}${hint}${
				body ? `\n${body}` : ''
			}`,
		}
	}

	let data: unknown
	try {
		data = await response.json()
	} catch (error) {
		return {
			status: 'error',
			message: `Product API response was not valid JSON: ${getErrorMessage(error)}`,
		}
	}

	const resources =
		data && typeof data === 'object' && 'resources' in data
			? (data as { resources?: unknown }).resources
			: null

	if (!Array.isArray(resources)) {
		return {
			status: 'error',
			message: `Product API response did not include an array "resources" field`,
		}
	}

	const lessons: Array<RemoteLesson> = []
	for (const resource of resources) {
		if (!resource || typeof resource !== 'object') continue
		const item = resource as Record<string, unknown>

		if (item._type === 'lesson') {
			const slug = item.slug
			if (typeof slug === 'string' && slug.trim().length > 0) {
				lessons.push({ slug: stripEpicAiSlugSuffix(slug), sectionSlug: null })
			}
			continue
		}

		if (item._type === 'section') {
			const sectionSlug =
				typeof item.slug === 'string' && item.slug.trim().length > 0
					? stripEpicAiSlugSuffix(item.slug.trim())
					: null
			const sectionLessons = item.lessons
			if (!Array.isArray(sectionLessons)) continue
			for (const lesson of sectionLessons) {
				if (!lesson || typeof lesson !== 'object') continue
				const lessonItem = lesson as Record<string, unknown>
				const slug = lessonItem.slug
				if (typeof slug === 'string' && slug.trim().length > 0) {
					lessons.push({
						slug: stripEpicAiSlugSuffix(slug),
						sectionSlug,
					})
				}
			}
		}
	}

	return { status: 'success', lessons }
}

async function collectOrderedVideoFiles({
	workshopRoot,
}: {
	workshopRoot: string
}): Promise<{
	files: Array<OrderedVideoFile>
	errors: Array<string>
	warnings: Array<string>
}> {
	const files: Array<OrderedVideoFile> = []
	const errors: Array<string> = []
	const warnings: Array<string> = []
	const exercisesRoot = path.join(workshopRoot, 'exercises')

	if (!(await isDirectory(exercisesRoot))) {
		errors.push('Missing `exercises/` directory (required for a workshop)')
		return { files, errors, warnings }
	}

	const workshopIntro = await resolveMdxFile(exercisesRoot, 'README')
	if (!workshopIntro) {
		errors.push('Missing workshop intro file `exercises/README.mdx`')
	} else {
		files.push({
			fullPath: workshopIntro,
			relativePath: path.relative(workshopRoot, workshopIntro),
		})
	}

	const workshopWrapUp = await resolveMdxFile(exercisesRoot, 'FINISHED')
	if (!workshopWrapUp) {
		errors.push('Missing workshop wrap-up file `exercises/FINISHED.mdx`')
	}

	const exerciseEntries = await fs.readdir(exercisesRoot, { withFileTypes: true })
	const exerciseDirNames = exerciseEntries
		.filter((e) => e.isDirectory() && /^\d+\./.test(e.name))
		.map((e) => e.name)
		.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))

	if (exerciseDirNames.length === 0) {
		warnings.push(
			'No exercise directories found (expected folders like "01.my-exercise" under exercises/)',
		)
	}

	for (const exerciseDirName of exerciseDirNames) {
		const exerciseRoot = path.join(exercisesRoot, exerciseDirName)
		const exerciseIntro = await resolveMdxFile(exerciseRoot, 'README')
		if (!exerciseIntro) {
			errors.push(
				`Missing exercise intro file (expected README.mdx): ${path.relative(workshopRoot, path.join(exerciseRoot, 'README.mdx'))}`,
			)
		} else {
			files.push({
				fullPath: exerciseIntro,
				relativePath: path.relative(workshopRoot, exerciseIntro),
			})
		}

		let entries: Array<Dirent> = []
		try {
			entries = await fs.readdir(exerciseRoot, { withFileTypes: true })
		} catch (error) {
			errors.push(
				`Failed to read exercise directory "${path.relative(workshopRoot, exerciseRoot)}": ${getErrorMessage(error)}`,
			)
			continue
		}

		const stepDirRegex = /^(?<stepNumber>\d+)\.(?<type>problem|solution)(\..*)?$/
		const stepsByNumber = new Map<
			number,
			{ problems: Array<string>; solutions: Array<string> }
		>()

		for (const entry of entries) {
			if (!entry.isDirectory()) continue
			const match = stepDirRegex.exec(entry.name)
			if (!match?.groups) continue
			const stepNumber = Number(match.groups.stepNumber)
			const type = match.groups.type as 'problem' | 'solution'
			if (!Number.isFinite(stepNumber) || stepNumber <= 0) continue

			const current = stepsByNumber.get(stepNumber) ?? {
				problems: [],
				solutions: [],
			}

			const fullStepDir = path.join(exerciseRoot, entry.name)
			if (type === 'problem') current.problems.push(fullStepDir)
			if (type === 'solution') current.solutions.push(fullStepDir)
			stepsByNumber.set(stepNumber, current)
		}

		if (stepsByNumber.size === 0) {
			warnings.push(
				`No step app directories found in "${path.relative(workshopRoot, exerciseRoot)}" (expected folders like "01.problem" and "01.solution")`,
			)
		}

		for (const [stepNumber, dirs] of [...stepsByNumber.entries()].sort(
			(a, b) => a[0] - b[0],
		)) {
			if (dirs.problems.length === 0) {
				errors.push(
					`Missing problem app directory for step ${stepNumber} in ${path.relative(workshopRoot, exerciseRoot)}`,
				)
			}
			if (dirs.solutions.length === 0) {
				errors.push(
					`Missing solution app directory for step ${stepNumber} in ${path.relative(workshopRoot, exerciseRoot)}`,
				)
			}
			if (dirs.problems.length > 1) {
				warnings.push(
					`Multiple problem app directories found for step ${stepNumber} in ${path.relative(workshopRoot, exerciseRoot)}`,
				)
			}
			if (dirs.solutions.length > 1) {
				warnings.push(
					`Multiple solution app directories found for step ${stepNumber} in ${path.relative(workshopRoot, exerciseRoot)}`,
				)
			}

			for (const problemDir of [...dirs.problems].sort((a, b) =>
				a.localeCompare(b),
			)) {
				const problemReadme = await resolveMdxFile(problemDir, 'README')
				if (!problemReadme) {
					errors.push(
						`Missing step problem README.mdx: ${path.relative(workshopRoot, path.join(problemDir, 'README.mdx'))}`,
					)
					continue
				}
				files.push({
					fullPath: problemReadme,
					relativePath: path.relative(workshopRoot, problemReadme),
				})
			}

			for (const solutionDir of [...dirs.solutions].sort((a, b) =>
				a.localeCompare(b),
			)) {
				const solutionReadme = await resolveMdxFile(solutionDir, 'README')
				if (!solutionReadme) {
					errors.push(
						`Missing step solution README.mdx: ${path.relative(workshopRoot, path.join(solutionDir, 'README.mdx'))}`,
					)
					continue
				}
				files.push({
					fullPath: solutionReadme,
					relativePath: path.relative(workshopRoot, solutionReadme),
				})
			}
		}

		const exerciseSummary = await resolveMdxFile(exerciseRoot, 'FINISHED')
		if (!exerciseSummary) {
			errors.push(
				`Missing exercise summary file (expected FINISHED.mdx): ${path.relative(workshopRoot, path.join(exerciseRoot, 'FINISHED.mdx'))}`,
			)
		} else {
			files.push({
				fullPath: exerciseSummary,
				relativePath: path.relative(workshopRoot, exerciseSummary),
			})
		}
	}

	if (workshopWrapUp) {
		files.push({
			fullPath: workshopWrapUp,
			relativePath: path.relative(workshopRoot, workshopWrapUp),
		})
	}

	return { files, errors, warnings }
}

function setEpicVideoUrl({
	epicVideoBlock,
	url,
}: {
	epicVideoBlock: string
	url: string
}) {
	const openingTagMatch = epicVideoBlock.match(/<EpicVideo\b[\s\S]*?>/)
	if (!openingTagMatch) {
		return epicVideoBlock
	}
	const openingTag = openingTagMatch[0]
	const urlAttrMatch = openingTag.match(/\burl\s*=\s*("([^"]*)"|'([^']*)')/)
	let nextOpeningTag = openingTag
	if (urlAttrMatch) {
		const currentUrl = urlAttrMatch[2] ?? urlAttrMatch[3] ?? ''
		if (currentUrl === url) return epicVideoBlock
		const quote = urlAttrMatch[1]?.startsWith("'") ? "'" : '"'
		nextOpeningTag = openingTag.replace(
			urlAttrMatch[0],
			`url=${quote}${url}${quote}`,
		)
	} else {
		nextOpeningTag = openingTag.replace(/\/?>$/, (suffix) => {
			return ` url="${url}"${suffix}`
		})
	}
	return epicVideoBlock.replace(openingTag, nextOpeningTag)
}

function upsertTitleEpicVideo({
	content,
	url,
}: {
	content: string
	url: string
}):
	| { status: 'success'; outcome: SetVideosOutcome; nextContent: string }
	| { status: 'error'; message: string } {
	const lineEnding = content.includes('\r\n') ? '\r\n' : '\n'
	const lines = content.split(/\r?\n/)
	const titleLineIndex = lines.findIndex((line) => /^\s{0,3}#\s+/.test(line))
	if (titleLineIndex < 0) {
		return {
			status: 'error',
			message: 'Missing top-level H1 title (`# ...`)',
		}
	}

	let firstNonEmptyAfterTitle = titleLineIndex + 1
	while (
		firstNonEmptyAfterTitle < lines.length &&
		lines[firstNonEmptyAfterTitle]?.trim() === ''
	) {
		firstNonEmptyAfterTitle++
	}

	const lineAfterTitle = lines[firstNonEmptyAfterTitle]?.trimStart() ?? ''
	if (lineAfterTitle.startsWith('<EpicVideo')) {
		const blockStart = firstNonEmptyAfterTitle
		let blockEnd = -1
		for (let index = blockStart; index < lines.length; index++) {
			const line = lines[index]?.trim() ?? ''
			if (line.includes('/>') || line.includes('</EpicVideo>')) {
				blockEnd = index
				break
			}
		}
		if (blockEnd < 0) {
			return {
				status: 'error',
				message: 'Found a top EpicVideo block but could not find its closing tag',
			}
		}

		const currentBlock = lines.slice(blockStart, blockEnd + 1).join(lineEnding)
		const nextBlock = setEpicVideoUrl({ epicVideoBlock: currentBlock, url })
		if (nextBlock === currentBlock) {
			return {
				status: 'success',
				outcome: 'unchanged',
				nextContent: content,
			}
		}

		const nextLines = [
			...lines.slice(0, blockStart),
			...nextBlock.split(/\r?\n/),
			...lines.slice(blockEnd + 1),
		]
		return {
			status: 'success',
			outcome: 'updated',
			nextContent: nextLines.join(lineEnding),
		}
	}

	const epicVideoLine = `<EpicVideo url="${url}" />`
	const nextLines = [
		...lines.slice(0, titleLineIndex + 1),
		'',
		epicVideoLine,
		'',
		...lines.slice(firstNonEmptyAfterTitle),
	]

	return {
		status: 'success',
		outcome: 'inserted',
		nextContent: nextLines.join(lineEnding),
	}
}

export async function setVideos(
	options: SetVideosOptions = {},
): Promise<SetVideosResult> {
	const workshopRoot = path.resolve(
		options.workshopRoot ?? process.env.EPICSHOP_CONTEXT_CWD ?? process.cwd(),
	)
	process.env.EPICSHOP_CONTEXT_CWD = workshopRoot
	const { silent = false, dryRun = false } = options

	const packageJsonPath = path.join(workshopRoot, 'package.json')
	let packageJson: unknown
	try {
		const raw = await fs.readFile(packageJsonPath, 'utf8')
		packageJson = JSON.parse(raw)
	} catch (error) {
		return createFailureResult(
			`Failed to read/parse package.json: ${getErrorMessage(error)}`,
			{ dryRun },
		)
	}

	const product =
		packageJson && typeof packageJson === 'object'
			? (packageJson as { epicshop?: { product?: unknown } }).epicshop?.product
			: null

	const productHost =
		product &&
		typeof product === 'object' &&
		typeof (product as { host?: unknown }).host === 'string'
			? (product as { host: string }).host.trim()
			: ''
	const productSlug =
		product &&
		typeof product === 'object' &&
		typeof (product as { slug?: unknown }).slug === 'string'
			? (product as { slug: string }).slug.trim()
			: ''

	if (!productHost) {
		return createFailureResult(
			'Missing `epicshop.product.host` in package.json (required for set-videos)',
			{ dryRun },
		)
	}
	if (/^https?:\/\//i.test(productHost) || productHost.includes('/')) {
		return createFailureResult(
			'`epicshop.product.host` should be a host only (for example: "www.epicweb.dev")',
			{ dryRun },
		)
	}
	if (!productSlug) {
		return createFailureResult(
			'Missing `epicshop.product.slug` in package.json (required for set-videos)',
			{ dryRun },
		)
	}

	const { files, errors, warnings } = await collectOrderedVideoFiles({
		workshopRoot,
	})
	if (errors.length > 0) {
		const message = `Cannot set videos because workshop structure is invalid:\n- ${errors.join('\n- ')}`
		return {
			...createFailureResult(message, { dryRun }),
			warnings,
		}
	}

	const remoteResult = await fetchRemoteWorkshopLessons({
		productHost,
		workshopSlug: productSlug,
	})
	if (remoteResult.status === 'error') {
		return {
			...createFailureResult(remoteResult.message, { dryRun }),
			warnings,
		}
	}

	const remoteLessons = remoteResult.lessons
	if (remoteLessons.length === 0) {
		return {
			...createFailureResult(
				'Product API returned no lessons. Is the workshop published on the product site?',
				{ dryRun },
			),
			warnings,
		}
	}

	if (remoteLessons.length < files.length) {
		const unassignedFiles = files
			.slice(remoteLessons.length)
			.map((file) => `- ${file.relativePath}`)
			.join('\n')
		return {
			...createFailureResult(
				`Not enough product lessons to map onto workshop files.\nExpected at least ${files.length} lessons, but received ${remoteLessons.length}.\nUnassigned files:\n${unassignedFiles}`,
				{ dryRun },
			),
			warnings,
		}
	}

	const plannedEdits: Array<{
		file: OrderedVideoFile
		nextContent: string
		outcome: SetVideosOutcome
	}> = []
	const editErrors: Array<string> = []

	for (const [index, file] of files.entries()) {
		const lesson = remoteLessons[index]
		if (!lesson) continue
		const targetUrl = formatProductLessonUrl({
			productHost,
			productSlug,
			lessonSlug: lesson.slug,
			sectionSlug: lesson.sectionSlug,
		})

		let currentContent = ''
		try {
			currentContent = await fs.readFile(file.fullPath, 'utf8')
		} catch (error) {
			editErrors.push(
				`Failed to read "${file.relativePath}": ${getErrorMessage(error)}`,
			)
			continue
		}

		const result = upsertTitleEpicVideo({
			content: currentContent,
			url: targetUrl,
		})
		if (result.status === 'error') {
			editErrors.push(`${file.relativePath}: ${result.message}`)
			continue
		}

		plannedEdits.push({
			file,
			nextContent: result.nextContent,
			outcome: result.outcome,
		})
	}

	if (editErrors.length > 0) {
		return {
			...createFailureResult(
				`Could not update videos for all files:\n- ${editErrors.join('\n- ')}`,
				{ dryRun },
			),
			warnings,
		}
	}

	if (!dryRun) {
		for (const edit of plannedEdits) {
			if (edit.outcome === 'unchanged') continue
			await fs.writeFile(edit.file.fullPath, edit.nextContent)
		}
	}

	const inserted = plannedEdits.filter((edit) => edit.outcome === 'inserted').length
	const updated = plannedEdits.filter((edit) => edit.outcome === 'updated').length
	const unchanged = plannedEdits.filter(
		(edit) => edit.outcome === 'unchanged',
	).length

	if (remoteLessons.length > files.length) {
		const extras = remoteLessons
			.slice(files.length)
			.map((lesson) =>
				formatProductLessonUrl({
					productHost,
					productSlug,
					lessonSlug: lesson.slug,
					sectionSlug: lesson.sectionSlug,
				}),
			)
		warnings.push(
			`Product has ${extras.length} extra lesson(s) beyond mapped files:\n- ${extras.join('\n- ')}`,
		)
	}

	if (!silent) {
		console.log(chalk.bold.cyan('\n🛠️  Admin: Set videos\n'))
		console.log(
			chalk.green(
				`✅ ${dryRun ? 'Planned' : 'Updated'} EpicVideo mappings (inserted: ${inserted}, updated: ${updated}, unchanged: ${unchanged})`,
			),
		)
		if (dryRun) {
			console.log(chalk.yellow('🧪 Dry run enabled: no files were modified.'))
		}
		if (warnings.length > 0) {
			console.log()
			for (const warning of warnings) {
				console.log(chalk.yellow(`⚠️ ${warning}`))
			}
		}
		console.log()
	}

	return {
		success: true,
		message: dryRun
			? 'Set videos dry run completed successfully'
			: 'Set videos completed successfully',
		inserted,
		updated,
		unchanged,
		warnings,
		dryRun,
	}
}
