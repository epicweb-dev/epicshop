import { invariant } from '@epic-web/invariant'
import * as cookie from 'cookie'

import md5 from 'md5-hex'
import PQueue from 'p-queue'
import { z } from 'zod'
import {
	getExerciseApp,
	getExercises,
	getWorkshopFinished,
	getWorkshopInstructions,
} from './apps.server.ts'
import { cachified, epicApiCache } from './cache.server.ts'
import { getWorkshopConfig } from './config.server.ts'
import { getAuthInfo, setAuthInfo } from './db.server.ts'
import { getEnv } from './init-env.ts'
import { logger } from './logger.ts'
import { type Timings } from './timing.server.ts'
import { getErrorMessage } from './utils.ts'

// Module-level logger for epic-api operations
const log = logger('epic:api')

const Transcript = z
	.string()
	.nullable()
	.optional()
	.transform((s) => s ?? 'Transcripts not available')
const EpicVideoInfoSchema = z
	.object({
		title: z.string().nullable().optional(),
		transcript: Transcript,
		muxPlaybackId: z.string(),
		duration: z.number().nullable().optional(),
		durationEstimate: z.number().nullable().optional(),
	})
	.transform((data) => {
		if (!data.duration && data.transcript) {
			// estimate duration from transcript. Grab the last transcript timestamp and use that
			const timestampRegex = /(\d+:\d+)/g

			const lastTimestampMatch = Array.from(
				data.transcript.matchAll(timestampRegex),
			).pop()
			if (lastTimestampMatch) {
				const lastTimestamp = lastTimestampMatch[1]
				if (!lastTimestamp) return data

				const durationInSeconds = hmsToSeconds(lastTimestamp)
				return {
					...data,
					durationEstimate: durationInSeconds,
				}
			}
		}

		return data
	})

const EpicVideoDownloadSchema = z.object({
	quality: z.string(),
	url: z.string(),
	width: z.number().optional(),
	height: z.number().optional(),
	bitrate: z.number().optional(),
	filesize: z.number().optional(),
})

const EpicVideoDownloadSizeSchema = z.object({
	quality: z.string(),
	size: z.number().nullable(),
})

const EpicVideoMetadataSchema = z.object({
	playbackId: z.string(),
	assetId: z.string().nullable().optional(),
	status: z.string().nullable().optional(),
	duration: z.number().nullable().optional(),
	downloads: z.array(EpicVideoDownloadSchema).nullable().optional(),
})

function hmsToSeconds(str: string) {
	const p = str.split(':')
	let s = 0
	let m = 1

	while (p.length > 0) {
		s += m * parseInt(p.pop() ?? '0', 10)
		m *= 60
	}
	return s
}

const EpicVideoRegionRestrictedErrorSchema = z.object({
	requestCountry: z.string(),
	restrictedCountry: z.string(),
	isRegionRestricted: z.literal(true),
})

const CachedEpicVideoInfoSchema = z
	.object({
		title: z.string().nullable().optional(),
		transcript: Transcript,
		muxPlaybackId: z.string(),
		duration: z.number().nullable().optional(),
		durationEstimate: z.number().nullable().optional(),
		downloadsAvailable: z.boolean().optional().default(false),
		downloadSizes: z.array(EpicVideoDownloadSizeSchema).optional().default([]),
		status: z.literal('success'),
		statusCode: z.number(),
		statusText: z.string(),
	})
	.or(
		z.object({
			status: z.literal('error'),
			statusCode: z.number(),
			statusText: z.string(),
			type: z.literal('unknown'),
		}),
	)
	.or(
		z.object({
			status: z.literal('error'),
			statusCode: z.number(),
			statusText: z.string(),
			type: z.literal('region-restricted'),
			requestCountry: z.string(),
			restrictedCountry: z.string(),
		}),
	)
	.or(z.null())

export type EpicVideoInfos = Record<
	string,
	Awaited<ReturnType<typeof getEpicVideoInfo>>
>

export type EpicVideoMetadata = z.infer<typeof EpicVideoMetadataSchema>

const videoInfoLog = log.logger('video-info')
const videoMetadataLog = log.logger('video-metadata')
const EPIC_VIDEO_INFO_CONCURRENCY = 6

export function normalizeVideoApiHost(host: string) {
	if (host === 'epicweb.dev') return 'www.epicweb.dev'
	if (host === 'epicreact.dev') return 'www.epicreact.dev'
	if (host === 'epicai.pro') return 'www.epicai.pro'
	return host
}

export async function getEpicVideoMetadata({
	playbackId,
	host,
	accessToken,
	request,
	timings,
}: {
	playbackId: string
	host: string
	accessToken?: string
	request?: Request
	timings?: Timings
}) {
	if (getEnv().EPICSHOP_DEPLOYED) return null
	const normalizedHost = normalizeVideoApiHost(host)
	const key = `epic-video-metadata:${normalizedHost}:${playbackId}`
	return cachified({
		key,
		request,
		cache: epicApiCache,
		timings,
		ttl: 1000 * 60 * 60,
		swr: 1000 * 60 * 60 * 24 * 365 * 10,
		offlineFallbackValue: null,
		checkValue: EpicVideoMetadataSchema.nullable(),
		async getFreshValue(context): Promise<EpicVideoMetadata | null> {
			const apiUrl = `https://${normalizedHost}/api/video/${encodeURIComponent(
				playbackId,
			)}`
			videoMetadataLog(`making video metadata request to: ${apiUrl}`)
			const response = await fetch(
				apiUrl,
				accessToken
					? { headers: { authorization: `Bearer ${accessToken}` } }
					: undefined,
			).catch((e) => new Response(getErrorMessage(e), { status: 500 }))
			videoMetadataLog(
				`video metadata response: ${response.status} ${response.statusText}`,
			)
			if (!response.ok) {
				context.metadata.ttl = 1000 * 2
				context.metadata.swr = 0
				return null
			}
			const rawInfo = await response.json()
			const parsedInfo = EpicVideoMetadataSchema.safeParse(rawInfo)
			if (parsedInfo.success) {
				return parsedInfo.data
			}
			context.metadata.ttl = 1000 * 2
			context.metadata.swr = 0
			videoMetadataLog.error(
				`video metadata parsing failed for ${playbackId}`,
				{
					host: normalizedHost,
					rawInfo,
					parseError: parsedInfo.error,
				},
			)
			return null
		},
	}).catch((e) => {
		videoMetadataLog.error(
			`failed to fetch video metadata for ${playbackId}:`,
			e,
		)
		return null
	})
}

export async function getEpicVideoInfos(
	epicWebUrls?: Array<string> | null,
	{ request, timings }: { request?: Request; timings?: Timings } = {},
) {
	if (!epicWebUrls) {
		videoInfoLog.warn('no epic web URLs provided, returning empty object')
		return {}
	}

	const authInfo = await getAuthInfo()
	if (getEnv().EPICSHOP_DEPLOYED) return {}

	const uniqueUrls = Array.from(new Set(epicWebUrls))
	videoInfoLog(`fetching epic video infos for ${uniqueUrls.length} URLs`)
	const epicVideoInfos: EpicVideoInfos = {}
	const queue = new PQueue({ concurrency: EPIC_VIDEO_INFO_CONCURRENCY })
	const results = await Promise.all(
		uniqueUrls.map((epicVideoEmbed) =>
			queue.add(async () => ({
				epicVideoEmbed,
				info: await getEpicVideoInfo({
					epicVideoEmbed,
					accessToken: authInfo?.tokenSet.access_token,
					request,
					timings,
				}),
			})),
		),
	)
	for (const result of results) {
		if (!result.info) continue
		epicVideoInfos[result.epicVideoEmbed] = result.info
	}
	videoInfoLog(
		`successfully fetched ${Object.keys(epicVideoInfos).length} epic video infos`,
	)
	return epicVideoInfos
}

async function getEpicVideoInfo({
	epicVideoEmbed,
	accessToken,
	request,
	timings,
}: {
	epicVideoEmbed: string
	accessToken?: string
	request?: Request
	timings?: Timings
}) {
	const tokenPortion = accessToken ? md5(accessToken) : 'unauthenticated'
	const key = `epic-video-info:${tokenPortion}:${epicVideoEmbed}`

	videoInfoLog(`fetching video info for URL: ${epicVideoEmbed}`)
	return cachified({
		key,
		request,
		cache: epicApiCache,
		timings,
		ttl: 1000 * 60 * 60,
		swr: 1000 * 60 * 60 * 24 * 365 * 10,
		offlineFallbackValue: null,
		checkValue: CachedEpicVideoInfoSchema,
		async getFreshValue(context) {
			const epicUrl = new URL(epicVideoEmbed)
			if (
				epicUrl.host !== 'www.epicweb.dev' &&
				epicUrl.host !== 'www.epicreact.dev' &&
				epicUrl.host !== 'www.epicai.pro'
			) {
				videoInfoLog.error(`unsupported host for video URL: ${epicUrl.host}`)
				return null
			}

			// this may be temporary until the /tutorials/ endpoint supports /api
			if (epicUrl.pathname.startsWith('/tutorials/')) {
				epicUrl.pathname = epicUrl.pathname.replace(
					/^\/tutorials\//,
					'/workshops/',
				)
			}

			// special case for epicai.pro videos
			const apiUrl =
				epicUrl.host === 'www.epicai.pro'
					? getEpicAIVideoAPIUrl(epicVideoEmbed)
					: `https://${epicUrl.host}/api${epicUrl.pathname}`

			videoInfoLog(`making API request to: ${apiUrl}`)
			const infoResponse = await fetch(
				apiUrl,
				accessToken
					? { headers: { authorization: `Bearer ${accessToken}` } }
					: undefined,
			)
			const { status, statusText } = infoResponse
			videoInfoLog(`API response: ${status} ${statusText}`)

			if (infoResponse.status >= 200 && infoResponse.status < 300) {
				let rawInfo = await infoResponse.json()
				// another special case for epicai.pro videos
				if (epicUrl.host === 'www.epicai.pro') {
					rawInfo = preprocessEpicAIVideoAPIResult(rawInfo)
				}
				const infoResult = EpicVideoInfoSchema.safeParse(rawInfo)
				if (infoResult.success) {
					const metadata = await getEpicVideoMetadata({
						playbackId: infoResult.data.muxPlaybackId,
						host: epicUrl.host,
						accessToken,
						request,
						timings,
					})
					const duration = metadata?.duration ?? infoResult.data.duration
					const downloadSizes =
						metadata?.downloads
							?.filter((download) => Boolean(download.url))
							.map((download) => ({
								quality: download.quality,
								size:
									typeof download.filesize === 'number' &&
									Number.isFinite(download.filesize)
										? download.filesize
										: null,
							})) ?? []
					const downloadsAvailable = downloadSizes.length > 0
					videoInfoLog(`successfully parsed video info for ${epicVideoEmbed}`)
					return {
						status: 'success',
						statusCode: status,
						statusText,
						...infoResult.data,
						duration,
						downloadsAvailable,
						downloadSizes,
					} as const
				} else {
					// don't cache errors for long...
					context.metadata.ttl = 1000 * 2
					context.metadata.swr = 0
					const restrictedResult =
						EpicVideoRegionRestrictedErrorSchema.safeParse(rawInfo)
					if (restrictedResult.success) {
						videoInfoLog.warn(`video is region restricted: ${epicVideoEmbed}`)
						return {
							status: 'error',
							statusCode: status,
							statusText,
							type: 'region-restricted',
							...restrictedResult.data,
						} as const
					} else {
						videoInfoLog.error(
							`API response parsing failed for ${epicVideoEmbed}`,
							{
								url: epicUrl.pathname,
								rawInfo,
								parseError: infoResult.error,
							},
						)
						return {
							status: 'error',
							statusCode: 500,
							statusText: 'API Data Type Mismatch',
							type: 'unknown',
						} as const
					}
				}
			} else {
				// don't cache errors for long...
				context.metadata.ttl = 1000 * 2
				context.metadata.swr = 0
				videoInfoLog.error(`video API request failed for ${epicVideoEmbed}`, {
					status,
					statusText,
					url: apiUrl,
				})
				return {
					status: 'error',
					statusCode: status,
					statusText,
					type: 'unknown',
				} as const
			}
		},
	}).catch((e) => {
		videoInfoLog.error(
			`failed to fetch epic video info for ${epicVideoEmbed}:`,
			e,
		)
		throw e
	})
}

function getEpicAIVideoAPIUrl(epicVideoEmbed: string) {
	const epicUrl = new URL(epicVideoEmbed)
	const pathSegments = epicUrl.pathname.split('/').filter(Boolean)

	if (epicUrl.pathname.endsWith('/solution')) {
		// slug is right before 'solution'
		const slug = pathSegments.at(-2)
		invariant(slug, 'Expected slug before /solution in pathname')
		return `https://www.epicai.pro/api/lessons/${slug}/solution`
	} else if (epicUrl.pathname.includes('/workshops')) {
		const slug = pathSegments.at(-1)
		invariant(slug, 'Expected slug at end of /workshops pathname')
		return `https://www.epicai.pro/api/lessons?slugOrId=${slug}`
	} else {
		const slug = pathSegments.at(-1)
		invariant(slug, 'Expected slug at end of pathname')
		return `https://www.epicai.pro/api/posts?slugOrId=${slug}`
	}
}

function preprocessEpicAIVideoAPIResult(result: any) {
	const PostVideoResourceSchema = z.object({
		resource: z.object({
			type: z.literal('videoResource'),
			fields: EpicVideoInfoSchema,
		}),
	})
	const PostSchema = z.object({
		fields: z.object({ title: z.string() }),
		resources: z.array(z.any()).nullable(),
	})
	const post = PostSchema.safeParse(result)
	if (!post.success) return null
	for (const resource of post.data.resources ?? []) {
		const videoResource = PostVideoResourceSchema.safeParse(resource)

		if (videoResource.success) {
			return {
				...videoResource.data.resource.fields,
				title: post.data.fields.title,
			}
		}
	}

	return null
}

async function getEpicProgress({
	timings,
	request,
	forceFresh,
}: { timings?: Timings; request?: Request; forceFresh?: boolean } = {}) {
	if (getEnv().EPICSHOP_DEPLOYED) return []

	const authInfo = await getAuthInfo()
	const {
		product: { host },
	} = getWorkshopConfig()
	if (!authInfo) return []

	const tokenPart = md5(authInfo.tokenSet.access_token)
	const EpicProgressSchema = z.array(
		z.object({
			lessonId: z.string(),
			completedAt: z.string().nullable(),
		}),
	)

	log(`fetching progress from EpicWeb host: ${host}`)
	return cachified({
		key: `epic-progress:${host}:${tokenPart}`,
		cache: epicApiCache,
		request,
		timings,
		forceFresh,
		ttl: 1000 * 2,
		swr: 1000 * 60 * 60 * 24 * 365 * 10,
		offlineFallbackValue: [],
		checkValue: EpicProgressSchema,
		async getFreshValue(context) {
			const progressUrl = `https://${host}/api/progress`
			log(`making progress API request to: ${progressUrl}`)

			const response = await fetch(progressUrl, {
				headers: {
					authorization: `Bearer ${authInfo.tokenSet.access_token}`,
				},
			}).catch((e) => new Response(getErrorMessage(e), { status: 500 }))

			log(`progress API response: ${response.status} ${response.statusText}`)

			if (response.status < 200 || response.status >= 300) {
				log.error(
					`failed to fetch progress from EpicWeb: ${response.status} ${response.statusText}`,
				)
				console.error(
					`Failed to fetch progress from EpicWeb: ${response.status} ${response.statusText}`,
				)
				// don't cache errors for long...
				context.metadata.ttl = 1000 * 2
				context.metadata.swr = 0
				return []
			}

			const progressData = await response.json()
			const parsedProgress = EpicProgressSchema.parse(progressData)
			log(`successfully fetched ${parsedProgress.length} progress entries`)
			return parsedProgress
		},
	})
}

export type Progress = Awaited<ReturnType<typeof getProgress>>[number]
export async function getProgress({
	timings,
	request,
}: {
	timings?: Timings
	request?: Request
} = {}) {
	if (getEnv().EPICSHOP_DEPLOYED) return []

	const authInfo = await getAuthInfo()
	if (!authInfo) return []

	const {
		product: { slug, host },
	} = getWorkshopConfig()
	if (!slug) return []

	log(`aggregating progress data for workshop: ${slug}`)
	const [
		workshopData,
		epicProgress,
		workshopInstructions,
		workshopFinished,
		exercises,
	] = await Promise.all([
		getWorkshopData(slug, { request, timings }),
		getEpicProgress({ request, timings }),
		getWorkshopInstructions({ request }),
		getWorkshopFinished({ request }),
		getExercises({ request, timings }),
	])

	type ProgressInfo = {
		epicLessonUrl: string
		epicLessonSlug: string
		epicCompletedAt: string | null
	}
	const progress: Array<
		ProgressInfo &
			(ReturnType<typeof getProgressForLesson> | { type: 'unknown' })
	> = []

	for (const resource of workshopData.resources ?? []) {
		const lessons = resource._type === 'section' ? resource.lessons : [resource]
		for (const lesson of lessons) {
			const epicLessonSlug = lesson.slug
			const lessonProgress = epicProgress.find(
				({ lessonId }) => lessonId === lesson._id,
			)
			const epicCompletedAt = lessonProgress ? lessonProgress.completedAt : null
			const progressForLesson = getProgressForLesson(epicLessonSlug, {
				workshopInstructions,
				workshopFinished,
				exercises,
			})
			const epicLessonUrl = `https://${host}/workshops/${slug}/${epicLessonSlug}`
			if (progressForLesson) {
				progress.push({
					...progressForLesson,
					epicLessonUrl,
					epicLessonSlug,
					epicCompletedAt,
				})
			} else {
				progress.push({
					type: 'unknown',
					epicLessonUrl,
					epicLessonSlug,
					epicCompletedAt,
				})
			}
		}
	}

	log(`processed ${progress.length} progress entries for workshop: ${slug}`)
	return progress
}

function getProgressForLesson(
	epicLessonSlug: string,
	{
		workshopInstructions,
		workshopFinished,
		exercises,
	}: {
		workshopInstructions: Awaited<ReturnType<typeof getWorkshopInstructions>>
		workshopFinished: Awaited<ReturnType<typeof getWorkshopFinished>>
		exercises: Awaited<ReturnType<typeof getExercises>>
	},
) {
	const hasEmbed = (embed?: Array<string>) =>
		embed?.some((e) => e.split('/').at(-1) === epicLessonSlug)
	if (
		workshopInstructions.compiled.status === 'success' &&
		hasEmbed(workshopInstructions.compiled.epicVideoEmbeds)
	) {
		return { type: 'workshop-instructions' } as const
	}
	if (
		workshopFinished.compiled.status === 'success' &&
		hasEmbed(workshopFinished.compiled.epicVideoEmbeds)
	) {
		return { type: 'workshop-finished' } as const
	}
	for (const exercise of exercises) {
		if (hasEmbed(exercise.instructionsEpicVideoEmbeds)) {
			return {
				type: 'instructions',
				exerciseNumber: exercise.exerciseNumber,
			} as const
		}
		if (hasEmbed(exercise.finishedEpicVideoEmbeds)) {
			return {
				type: 'finished',
				exerciseNumber: exercise.exerciseNumber,
			} as const
		}
		for (const step of exercise.steps.filter(Boolean)) {
			if (hasEmbed(step.problem?.epicVideoEmbeds)) {
				return {
					type: 'step',
					exerciseNumber: exercise.exerciseNumber,
					stepNumber: step.stepNumber,
				} as const
			}
		}
	}
}

export async function updateProgress(
	{ lessonSlug, complete }: { lessonSlug: string; complete?: boolean },
	{
		timings,
		request,
	}: {
		timings?: Timings
		request?: Request
	} = {},
) {
	if (getEnv().EPICSHOP_DEPLOYED) {
		return {
			status: 'error',
			error: 'cannot update progress when deployed',
		} as const
	}

	const authInfo = await getAuthInfo()
	if (!authInfo) {
		return { status: 'error', error: 'not authenticated' } as const
	}

	const {
		product: { host },
	} = getWorkshopConfig()

	const progressUrl = `https://${host}/api/progress`
	const payload = complete ? { lessonSlug } : { lessonSlug, remove: true }

	log(`updating progress for lesson: ${lessonSlug} (complete: ${complete})`)
	log(
		`making POST request to: ${progressUrl} with payload: ${JSON.stringify(payload)}`,
	)

	const response = await fetch(progressUrl, {
		method: 'POST',
		headers: {
			authorization: `Bearer ${authInfo.tokenSet.access_token}`,
			'content-type': 'application/json',
		},
		body: JSON.stringify(payload),
	}).catch((e) => new Response(getErrorMessage(e), { status: 500 }))

	log(`progress update response: ${response.status} ${response.statusText}`)

	// force the progress to be fresh whether or not we're successful
	await getEpicProgress({ forceFresh: true, request, timings })

	if (response.status < 200 || response.status >= 300) {
		log(`progress update failed: ${response.status} ${response.statusText}`)
		return {
			status: 'error',
			error: `${response.status} ${response.statusText}`,
		} as const
	}

	log(`progress update successful for lesson: ${lessonSlug}`)
	return { status: 'success' } as const
}

const ModuleSchema = z.object({
	resources: z
		.array(
			z.union([
				z.object({
					_type: z.literal('lesson'),
					_id: z.string(),
					slug: z.string(),
				}),
				z.object({
					_type: z.literal('section'),
					lessons: z.array(z.object({ _id: z.string(), slug: z.string() })),
				}),
			]),
		)
		.nullable(),
})

export async function getWorkshopData(
	slug: string,
	{
		timings,
		request,
		forceFresh,
	}: {
		timings?: Timings
		request?: Request
		forceFresh?: boolean
	} = {},
) {
	if (getEnv().EPICSHOP_DEPLOYED) return { resources: [] }

	const authInfo = await getAuthInfo()
	// auth is not required, but we only use it for progress which is only needed
	// if you're authenticated anyway.
	if (!authInfo) return { resources: [] }

	const {
		product: { host },
	} = getWorkshopConfig()

	log(`fetching workshop data for slug: ${slug} from host: ${host}`)
	return cachified({
		key: `epic-workshop-data:${host}:${slug}`,
		ttl: 1000 * 60 * 5,
		swr: 1000 * 60 * 60 * 24 * 365 * 10,
		cache: epicApiCache,
		request,
		forceFresh,
		timings,
		offlineFallbackValue: { resources: [] },
		checkValue: ModuleSchema,
		async getFreshValue() {
			const workshopUrl = `https://${host}/api/workshops/${encodeURIComponent(slug)}`
			log(`making workshop data request to: ${workshopUrl}`)

			const response = await fetch(workshopUrl).catch(
				(e) => new Response(getErrorMessage(e), { status: 500 }),
			)

			log(`workshop data response: ${response.status} ${response.statusText}`)

			if (response.status < 200 || response.status >= 300) {
				log.error(
					`failed to fetch workshop data from EpicWeb for ${slug}: ${response.status} ${response.statusText}`,
				)
				console.error(
					`Failed to fetch workshop data from EpicWeb for ${slug}: ${response.status} ${response.statusText}`,
				)
				return { resources: [] }
			}

			const jsonResponse = await response.json()
			const parsedData = ModuleSchema.parse(jsonResponse)
			log(
				`successfully fetched workshop data for ${slug} with ${parsedData.resources?.length ?? 0} resources`,
			)
			return parsedData
		},
	})
}

export async function userHasAccessToExerciseStep({
	exerciseNumber,
	stepNumber,
	timings,
	request,
	forceFresh,
}: {
	exerciseNumber: number
	stepNumber: number
	request?: Request
	timings?: Timings
	forceFresh?: boolean
}) {
	const hasAccessToWorkshop = await userHasAccessToWorkshop({
		request,
		timings,
		forceFresh,
	})
	if (hasAccessToWorkshop) return true

	if (getEnv().EPICSHOP_DEPLOYED) return false

	// if they have access to the solution then they have access to the exercise step
	const exerciseApp = await getExerciseApp(
		{ exerciseNumber, stepNumber, type: 'solution' },
		{ request, timings },
	)
	if (!exerciseApp) return false

	const [firstVideoEmbed] = exerciseApp.epicVideoEmbeds ?? []
	if (!firstVideoEmbed) return true

	const authInfo = await getAuthInfo()
	if (!authInfo) return false

	const videoInfo = await getEpicVideoInfo({
		accessToken: authInfo.tokenSet.access_token,
		epicVideoEmbed: firstVideoEmbed,
		request,
		timings,
	})

	return videoInfo?.status === 'success'
}

function tryGetWorkshopProduct(): { host?: string; slug?: string } {
	try {
		const config = getWorkshopConfig()
		return { host: config.product.host, slug: config.product.slug }
	} catch {
		return {}
	}
}

export async function userHasAccessToWorkshop({
	timings,
	request,
	forceFresh,
	productHost,
	workshopSlug,
}: {
	request?: Request
	timings?: Timings
	forceFresh?: boolean
	productHost?: string
	workshopSlug?: string
} = {}) {
	const configProduct = tryGetWorkshopProduct()
	const host = productHost ?? configProduct.host
	const slug = workshopSlug ?? configProduct.slug
	if (!slug) return true

	if (getEnv().EPICSHOP_DEPLOYED) {
		const cookieHeader = request?.headers.get('Cookie')
		if (!cookieHeader) return false
		const cookies = cookie.parse(cookieHeader)
		return cookies.skill?.split(',').includes(slug) ?? false
	}

	const authInfo = await getAuthInfo({ productHost: host })
	if (!authInfo) return false

	return cachified({
		key: `user-has-access-to-workshop:${host}:${slug}`,
		cache: epicApiCache,
		request,
		forceFresh,
		timings,
		ttl: 1000 * 5,
		offlineFallbackValue: false,
		checkValue: z.boolean(),
		async getFreshValue(context) {
			const accessUrl = `https://${host}/api/workshops/${encodeURIComponent(slug)}/access`
			log(`checking workshop access via API: ${accessUrl}`)

			const response = await fetch(accessUrl, {
				headers: {
					authorization: `Bearer ${authInfo.tokenSet.access_token}`,
				},
			}).catch((e) => new Response(getErrorMessage(e), { status: 500 }))

			log(
				`workshop access API response: ${response.status} ${response.statusText}`,
			)

			const hasAccess = response.ok ? (await response.json()) === true : false
			log(`workshop access result for ${slug}: ${hasAccess}`)

			if (hasAccess) {
				context.metadata.ttl = 1000 * 60 * 5
				context.metadata.swr = 1000 * 60 * 60 * 24 * 365 * 10
			}

			return hasAccess
		},
	}).catch((e) => {
		console.error('Failed to check workshop access', e)
		return false
	})
}

const UserInfoSchema = z
	.object({
		id: z.string(),
		name: z.string().nullable(),
		email: z.string().email(),
		image: z.string().nullable(),
		discordProfile: z
			.object({
				nick: z.string().nullable().optional(),
				user: z
					.object({
						id: z.string(),
						username: z.string(),
						avatar: z.string().nullable().optional(),
						global_name: z.string().nullable().optional(),
					})
					.optional(),
			})
			.nullable()
			.optional(),
	})
	.transform((data) => {
		return {
			...data,
			imageUrlSmall:
				resizeImageUrl(data.image, { size: 64 }) ??
				resolveDiscordAvatar(data.discordProfile?.user, {
					size: 64,
				}) ??
				resolveGravatarUrl(data.email, { size: 64 }),
			imageUrlLarge:
				resizeImageUrl(data.image, { size: 512 }) ??
				resolveDiscordAvatar(data.discordProfile?.user, {
					size: 512,
				}) ??
				resolveGravatarUrl(data.email, { size: 512 }),
		}
	})

function resizeImageUrl(url: string | null, { size }: { size: number }) {
	if (!url) return null
	const urlObj = new URL(url)
	urlObj.searchParams.set('size', size.toString())
	return urlObj.toString()
}

function resolveGravatarUrl(
	email: string | undefined,
	{ size }: { size: number },
) {
	if (!email) return null

	const hash = md5(email.toLowerCase())
	const gravatarOptions = new URLSearchParams({
		size: size.toString(),
		default: 'identicon',
	})
	return `https://www.gravatar.com/avatar/${hash}?${gravatarOptions.toString()}`
}

function resolveDiscordAvatar(
	user: { avatar?: string | null; id: string } | undefined,
	{ size }: { size: 16 | 32 | 64 | 128 | 256 | 512 | 1024 | 2048 | 4096 },
) {
	if (!user) return null

	const { avatar, id: userId } = user
	if (!avatar) return null
	const isGif = avatar.startsWith('a_')
	const url = new URL(
		`/avatars/${userId}/${avatar}.${isGif ? 'gif' : 'png'}`,
		'https://cdn.discordapp.com',
	)
	url.searchParams.set('size', size.toString())
	return url.toString()
}

export type UserInfo = z.infer<typeof UserInfoSchema>

const userinfoLog = log.logger('userinfo')
export async function getUserInfo({
	timings,
	request,
	forceFresh,
}: {
	timings?: Timings
	request?: Request
	forceFresh?: boolean
} = {}) {
	const authInfo = await getAuthInfo()
	if (!authInfo) return null

	const { tokenSet } = authInfo
	const {
		product: { host },
	} = getWorkshopConfig()

	const accessToken = tokenSet.access_token
	const url = `https://${host}/oauth/userinfo`

	userinfoLog(`calling cachified to get user info from: ${url}`)
	const userInfo = await cachified({
		key: `${url}:${md5(accessToken)}`,
		cache: epicApiCache,
		request,
		forceFresh,
		timings,
		ttl: 1000 * 30,
		swr: 1000 * 60 * 60 * 24 * 365 * 10,
		offlineFallbackValue: null,
		checkValue: UserInfoSchema,
		async getFreshValue() {
			userinfoLog(`getting fresh value for user info from: ${url}`)

			const response = await fetch(url, {
				headers: { authorization: `Bearer ${accessToken}` },
			}).catch((e) => new Response(getErrorMessage(e), { status: 500 }))

			userinfoLog(
				`user info API response: ${response.status} ${response.statusText}`,
			)

			if (!response.ok) {
				userinfoLog(
					`user info API request failed: ${response.status} ${response.statusText}`,
				)
				if (
					response.headers.get('content-type')?.includes('application/json')
				) {
					const data = await response.json()
					throw new Error(`Failed to fetch user info: ${JSON.stringify(data)}`)
				} else {
					const text = await response.text()
					throw new Error(
						`Failed to fetch user info: ${text || response.statusText}`,
					)
				}
			}

			const data = await response.json()
			const parsedUserInfo = UserInfoSchema.parse(data)
			userinfoLog(
				`successfully fetched user info for user: ${parsedUserInfo.id} (${parsedUserInfo.email})`,
			)
			return parsedUserInfo
		},
	}).catch((e) => {
		userinfoLog.error(`failed to get user info:`, e)
		return null
	})

	// we used to md5 hash the email to get the id
	// if the id doesn't match what we have on file, update it
	// you can probably safely remove this in January 2025
	if (userInfo && authInfo.id !== userInfo.id) {
		await setAuthInfo({
			...authInfo,
			id: userInfo.id,
		})
	}

	return userInfo
}

export async function warmCache() {
	await Promise.all([getUserInfo(), getProgress()])
}
