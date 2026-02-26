import { type Dirent } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'

import { getErrorMessage } from '@epic-web/workshop-utils/utils'
import chalk from 'chalk'
import {
	collectStepDirectories,
	formatProductLessonUrl,
	fetchRemoteWorkshopLessons,
	isDirectory,
	resolveMdxFile,
	stripEpicAiSlugSuffix,
} from './workshop-content-utils.js'

type OrderedVideoFile = {
	kind:
		| 'workshop-intro'
		| 'workshop-wrap-up'
		| 'exercise-intro'
		| 'exercise-summary'
		| 'step-problem'
		| 'step-solution'
	fullPath: string
	relativePath: string
	exerciseNumber?: number
	stepNumber?: number
}

type SetVideosOutcome = 'inserted' | 'updated' | 'unchanged'

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
			kind: 'workshop-intro',
			fullPath: workshopIntro,
			relativePath: path.relative(workshopRoot, workshopIntro),
		})
	}

	const workshopWrapUp = await resolveMdxFile(exercisesRoot, 'FINISHED')
	if (!workshopWrapUp) {
		errors.push('Missing workshop wrap-up file `exercises/FINISHED.mdx`')
	}

	const exerciseEntries = await fs.readdir(exercisesRoot, {
		withFileTypes: true,
	})
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
		const exerciseNumberMatch = /^(\d+)\./.exec(exerciseDirName)
		const exerciseNumber = exerciseNumberMatch
			? Number(exerciseNumberMatch[1])
			: undefined
		const exerciseIntro = await resolveMdxFile(exerciseRoot, 'README')
		if (!exerciseIntro) {
			errors.push(
				`Missing exercise intro file (expected README.mdx): ${path.relative(workshopRoot, path.join(exerciseRoot, 'README.mdx'))}`,
			)
		} else {
			files.push({
				kind: 'exercise-intro',
				fullPath: exerciseIntro,
				relativePath: path.relative(workshopRoot, exerciseIntro),
				exerciseNumber,
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

		const stepsByNumber = collectStepDirectories(entries, exerciseRoot)

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
					kind: 'step-problem',
					fullPath: problemReadme,
					relativePath: path.relative(workshopRoot, problemReadme),
					exerciseNumber,
					stepNumber,
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
					kind: 'step-solution',
					fullPath: solutionReadme,
					relativePath: path.relative(workshopRoot, solutionReadme),
					exerciseNumber,
					stepNumber,
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
				kind: 'exercise-summary',
				fullPath: exerciseSummary,
				relativePath: path.relative(workshopRoot, exerciseSummary),
				exerciseNumber,
			})
		}
	}

	if (workshopWrapUp) {
		files.push({
			kind: 'workshop-wrap-up',
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
				message:
					'Found a top EpicVideo block but could not find its closing tag',
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

function formatNumberedList(
	items: Array<string>,
	{ startAt = 1 }: { startAt?: number } = {},
) {
	return items.map((item, index) => `${startAt + index}. ${item}`).join('\n')
}

type FileLessonSlotPlan = {
	file: OrderedVideoFile
	lessonSlotIndex: number
}

function buildFileLessonSlotPlans(files: Array<OrderedVideoFile>): {
	plans: Array<FileLessonSlotPlan>
	requiredLessonSlots: number
} {
	const plans: Array<FileLessonSlotPlan> = []
	const stepSlotByKey = new Map<string, number>()
	let nextLessonSlotIndex = 0

	for (const file of files) {
		if (
			(file.kind === 'step-problem' || file.kind === 'step-solution') &&
			typeof file.exerciseNumber === 'number' &&
			typeof file.stepNumber === 'number'
		) {
			const key = `${file.exerciseNumber}:${file.stepNumber}`
			const existingSlot = stepSlotByKey.get(key)
			if (typeof existingSlot === 'number') {
				plans.push({ file, lessonSlotIndex: existingSlot })
				continue
			}
			const newSlot = nextLessonSlotIndex++
			stepSlotByKey.set(key, newSlot)
			plans.push({ file, lessonSlotIndex: newSlot })
			continue
		}

		const slot = nextLessonSlotIndex++
		plans.push({ file, lessonSlotIndex: slot })
	}

	return { plans, requiredLessonSlots: nextLessonSlotIndex }
}

export async function setVideos(
	options: SetVideosOptions = {},
): Promise<SetVideosResult> {
	const workshopRoot = path.resolve(
		options.workshopRoot ?? process.env.EPICSHOP_CONTEXT_CWD ?? process.cwd(),
	)
	process.env.EPICSHOP_CONTEXT_CWD = workshopRoot
	const { silent = false, dryRun = false } = options

	const fail = (
		message: string,
		{ warnings = [] as Array<string> }: { warnings?: Array<string> } = {},
	): SetVideosResult => {
		if (!silent) {
			console.log(chalk.bold.cyan('\n🛠️  Admin: Set videos\n'))
			console.log(chalk.red(`❌ ${message}`))
			if (warnings.length > 0) {
				console.log()
				for (const warning of warnings) {
					console.log(chalk.yellow(`⚠️ ${warning}`))
				}
			}
			console.log()
		}
		return {
			...createFailureResult(message, { dryRun }),
			warnings,
		}
	}

	const packageJsonPath = path.join(workshopRoot, 'package.json')
	let packageJson: unknown
	try {
		const raw = await fs.readFile(packageJsonPath, 'utf8')
		packageJson = JSON.parse(raw)
	} catch (error) {
		return fail(`Failed to read/parse package.json: ${getErrorMessage(error)}`)
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
		return fail(
			'Missing `epicshop.product.host` in package.json (required for set-videos)',
		)
	}
	if (/^https?:\/\//i.test(productHost) || productHost.includes('/')) {
		return fail(
			'`epicshop.product.host` should be a host only (for example: "www.epicweb.dev")',
		)
	}
	if (!productSlug) {
		return fail(
			'Missing `epicshop.product.slug` in package.json (required for set-videos)',
		)
	}

	const { files, errors, warnings } = await collectOrderedVideoFiles({
		workshopRoot,
	})
	if (errors.length > 0) {
		const message = `Cannot set videos because workshop structure is invalid:\n- ${errors.join('\n- ')}`
		return fail(message, {
			warnings,
		})
	}

	const normalizeLessonSlug = (value: string) =>
		stripEpicAiSlugSuffix(value.trim())
	const remoteResult = await fetchRemoteWorkshopLessons({
		productHost,
		workshopSlug: productSlug,
		normalizeLessonSlug,
		normalizeSectionSlug: normalizeLessonSlug,
		requireNonEmptyLessonSlug: true,
	})
	if (remoteResult.status === 'error') {
		return fail(remoteResult.message, {
			warnings,
		})
	}

	const remoteLessons = remoteResult.lessons
	if (remoteLessons.length === 0) {
		return fail(
			'Product API returned no lessons. Is the workshop published on the product site?',
			{
				warnings,
			},
		)
	}

	const { plans: fileLessonSlotPlans, requiredLessonSlots } =
		buildFileLessonSlotPlans(files)

	if (remoteLessons.length < requiredLessonSlots) {
		const assignedPairs = fileLessonSlotPlans
			.filter((plan) => plan.lessonSlotIndex < remoteLessons.length)
			.map((plan) => {
				const lesson = remoteLessons[plan.lessonSlotIndex]
				if (!lesson) return `${plan.file.relativePath} -> (no lesson)`
				const lessonUrl = formatProductLessonUrl({
					productHost,
					productSlug,
					lessonSlug: lesson.slug,
					sectionSlug: lesson.sectionSlug,
				})
				return `${plan.file.relativePath} -> ${lessonUrl}`
			})
		const unassignedLocalFiles = fileLessonSlotPlans
			.filter((plan) => plan.lessonSlotIndex >= remoteLessons.length)
			.map(
				(plan) =>
					`${plan.file.relativePath} (lesson slot ${plan.lessonSlotIndex + 1})`,
			)
		const remoteLessonsInOrder = remoteLessons.map((lesson) => {
			const lessonPath = lesson.sectionSlug
				? `${lesson.sectionSlug}/${lesson.slug}`
				: lesson.slug
			const lessonUrl = formatProductLessonUrl({
				productHost,
				productSlug,
				lessonSlug: lesson.slug,
				sectionSlug: lesson.sectionSlug,
			})
			return `${lessonPath} -> ${lessonUrl}`
		})
		const requiredLocalFilesInOrder = fileLessonSlotPlans.map(
			(plan) =>
				`${plan.file.relativePath} (lesson slot ${plan.lessonSlotIndex + 1})`,
		)
		return fail(
			`Not enough product lessons to map onto workshop files.\nExpected at least ${requiredLessonSlots} lessons, but received ${remoteLessons.length}.\nMissing ${requiredLessonSlots - remoteLessons.length} lesson(s).\nThis mapping uses one lesson slot for workshop intro/wrap-up, exercise intro/summary, and one shared lesson slot per exercise step (applied to both problem + solution files).\n\nAssigned file/video pairs (in order):\n${
				assignedPairs.length > 0 ? formatNumberedList(assignedPairs) : '(none)'
			}\n\nUnassigned local files (in order):\n${formatNumberedList(
				unassignedLocalFiles,
				{
					startAt: assignedPairs.length + 1,
				},
			)}\n\nProduct lessons returned by API (in order):\n${formatNumberedList(
				remoteLessonsInOrder,
			)}\n\nRequired local files (in order):\n${formatNumberedList(
				requiredLocalFilesInOrder,
			)}\n\nHint: verify the product workshop has all expected lessons published and in the same order as the local exercise/step instruction files.`,
			{
				warnings,
			},
		)
	}

	const plannedEdits: Array<{
		file: OrderedVideoFile
		nextContent: string
		outcome: SetVideosOutcome
	}> = []
	const editErrors: Array<string> = []

	for (const plan of fileLessonSlotPlans) {
		const lesson = remoteLessons[plan.lessonSlotIndex]
		if (!lesson) continue
		const targetUrl = formatProductLessonUrl({
			productHost,
			productSlug,
			lessonSlug: lesson.slug,
			sectionSlug: lesson.sectionSlug,
		})

		let currentContent = ''
		try {
			currentContent = await fs.readFile(plan.file.fullPath, 'utf8')
		} catch (error) {
			editErrors.push(
				`Failed to read "${plan.file.relativePath}": ${getErrorMessage(error)}`,
			)
			continue
		}

		const result = upsertTitleEpicVideo({
			content: currentContent,
			url: targetUrl,
		})
		if (result.status === 'error') {
			editErrors.push(`${plan.file.relativePath}: ${result.message}`)
			continue
		}

		plannedEdits.push({
			file: plan.file,
			nextContent: result.nextContent,
			outcome: result.outcome,
		})
	}

	if (editErrors.length > 0) {
		return fail(
			`Could not update videos for all files:\n- ${editErrors.join('\n- ')}`,
			{
				warnings,
			},
		)
	}

	if (!dryRun) {
		for (const edit of plannedEdits) {
			if (edit.outcome === 'unchanged') continue
			await fs.writeFile(edit.file.fullPath, edit.nextContent)
		}
	}

	const inserted = plannedEdits.filter(
		(edit) => edit.outcome === 'inserted',
	).length
	const updated = plannedEdits.filter(
		(edit) => edit.outcome === 'updated',
	).length
	const unchanged = plannedEdits.filter(
		(edit) => edit.outcome === 'unchanged',
	).length

	if (remoteLessons.length > requiredLessonSlots) {
		const extras = remoteLessons.slice(requiredLessonSlots).map((lesson) =>
			formatProductLessonUrl({
				productHost,
				productSlug,
				lessonSlug: lesson.slug,
				sectionSlug: lesson.sectionSlug,
			}),
		)
		warnings.push(
			`Product has ${extras.length} extra lesson(s) beyond mapped lesson slots:\n- ${extras.join('\n- ')}`,
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
