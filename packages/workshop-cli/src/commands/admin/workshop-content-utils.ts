import { type Dirent } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'

import { getAuthInfo } from '@epic-web/workshop-utils/db.server'
import { getErrorMessage } from '@epic-web/workshop-utils/utils'
import { pathExists } from '../../utils/filesystem.js'

export type RemoteLesson = {
	slug: string
	sectionSlug: string | null
}

type NormalizeSlug = (value: string) => string

export function stripEpicAiSlugSuffix(value: string) {
	// EpicAI embeds sometimes include a `~...` suffix in the slug segment.
	return value.replace(/~[^ ]*$/, '')
}

export function formatProductLessonUrl({
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
	// The product site will typically redirect to a section-specific path when needed.
	return sectionSlug
		? `https://${productHost}/workshops/${productSlug}/${sectionSlug}/${lessonSlug}`
		: `https://${productHost}/workshops/${productSlug}/${lessonSlug}`
}

export async function isDirectory(targetPath: string) {
	try {
		return (await fs.stat(targetPath)).isDirectory()
	} catch {
		return false
	}
}

export async function resolveMdxFile(
	dir: string,
	baseName: 'README' | 'FINISHED',
): Promise<string | null> {
	const mdx = path.join(dir, `${baseName}.mdx`)
	if (await pathExists(mdx)) return mdx
	return null
}

export function collectStepDirectories(
	entries: Array<Dirent>,
	exerciseRoot: string,
) {
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

	return stepsByNumber
}

export async function fetchRemoteWorkshopLessons({
	productHost,
	workshopSlug,
	normalizeLessonSlug,
	normalizeSectionSlug,
	requireNonEmptyLessonSlug = false,
}: {
	productHost: string
	workshopSlug: string
	normalizeLessonSlug?: NormalizeSlug
	normalizeSectionSlug?: NormalizeSlug
	requireNonEmptyLessonSlug?: boolean
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

	const applyNormalizer = (
		value: string,
		normalizer?: NormalizeSlug,
	): string => {
		return normalizer ? normalizer(value) : value
	}

	const lessons: Array<RemoteLesson> = []
	for (const resource of resources) {
		if (!resource || typeof resource !== 'object') continue
		const item = resource as Record<string, unknown>

		if (item._type === 'lesson') {
			const slug = item.slug
			if (typeof slug === 'string') {
				const normalizedSlug = applyNormalizer(slug, normalizeLessonSlug)
				if (requireNonEmptyLessonSlug && normalizedSlug.trim().length === 0) {
					continue
				}
				lessons.push({ slug: normalizedSlug, sectionSlug: null })
			}
			continue
		}

		if (item._type === 'section') {
			let sectionSlug: string | null = null
			if (typeof item.slug === 'string') {
				const normalizedSectionSlug = applyNormalizer(
					item.slug,
					normalizeSectionSlug,
				)
				const trimmedSectionSlug = normalizedSectionSlug.trim()
				if (trimmedSectionSlug.length > 0) {
					sectionSlug = trimmedSectionSlug
				}
			}
			const sectionLessons = item.lessons
			if (!Array.isArray(sectionLessons)) continue
			for (const lesson of sectionLessons) {
				if (!lesson || typeof lesson !== 'object') continue
				const lessonItem = lesson as Record<string, unknown>
				const slug = lessonItem.slug
				if (typeof slug === 'string') {
					const normalizedSlug = applyNormalizer(slug, normalizeLessonSlug)
					if (requireNonEmptyLessonSlug && normalizedSlug.trim().length === 0) {
						continue
					}
					lessons.push({ slug: normalizedSlug, sectionSlug })
				}
			}
		}
	}

	return { status: 'success', lessons }
}
