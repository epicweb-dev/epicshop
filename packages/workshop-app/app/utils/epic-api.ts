import {
	getExercises,
	getWorkshopFinished,
	getWorkshopInstructions,
} from '@epic-web/workshop-utils/apps.server'
import { cachified, fsCache } from '@epic-web/workshop-utils/cache.server'
import { getWorkshopConfig } from '@epic-web/workshop-utils/config.server'
import { getAuthInfo } from '@epic-web/workshop-utils/db.server'
import { type Timings } from '@epic-web/workshop-utils/timing.server'
import md5 from 'md5-hex'
import { z } from 'zod'
import { getErrorMessage } from './misc.tsx'

const Transcript = z
	.string()
	.nullable()
	.optional()
	.transform((s) => s ?? 'Transcripts not available')
const EpicVideoInfoSchema = z.object({
	transcript: Transcript,
	muxPlaybackId: z.string(),
})

const EpicVideoRegionRestrictedErrorSchema = z.object({
	requestCountry: z.string(),
	restrictedCountry: z.string(),
	isRegionRestricted: z.literal(true),
})

const CachedEpicVideoInfoSchema = z
	.object({
		transcript: Transcript,
		muxPlaybackId: z.string(),
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

export async function getEpicVideoInfos(
	epicWebUrls?: Array<string> | null,
	{ request, timings }: { request?: Request; timings?: Timings } = {},
) {
	if (!epicWebUrls) return {}
	const authInfo = await getAuthInfo()
	if (ENV.EPICSHOP_DEPLOYED) return {}

	const epicVideoInfos: EpicVideoInfos = {}
	for (const epicVideoEmbed of epicWebUrls) {
		const epicVideoInfo = await getEpicVideoInfo({
			epicVideoEmbed,
			accessToken: authInfo?.tokenSet.access_token,
			request,
			timings,
		})
		if (epicVideoInfo) {
			epicVideoInfos[epicVideoEmbed] = epicVideoInfo
		}
	}
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

	return cachified({
		key,
		request,
		cache: fsCache,
		timings,
		ttl: 1000 * 60 * 60,
		swr: 1000 * 60 * 60 * 24 * 30,
		checkValue: CachedEpicVideoInfoSchema,
		async getFreshValue(
			context,
		): Promise<z.infer<typeof CachedEpicVideoInfoSchema>> {
			const epicUrl = new URL(epicVideoEmbed)
			if (
				epicUrl.host !== 'www.epicweb.dev' &&
				epicUrl.host !== 'www.epicreact.dev'
			) {
				return null
			}

			// this may be temporary until the /tutorials/ endpoint supports /api
			if (epicUrl.pathname.startsWith('/tutorials/')) {
				epicUrl.pathname = epicUrl.pathname.replace(
					/^\/tutorials\//,
					'/workshops/',
				)
			}

			const infoResponse = await fetch(
				`https://${epicUrl.host}/api${epicUrl.pathname}`,
				accessToken
					? { headers: { authorization: `Bearer ${accessToken}` } }
					: undefined,
			)
			const { status, statusText } = infoResponse
			if (infoResponse.status >= 200 && infoResponse.status < 300) {
				const rawInfo = await infoResponse.json()
				const infoResult = EpicVideoInfoSchema.safeParse(rawInfo)
				if (infoResult.success) {
					return {
						status: 'success',
						statusCode: status,
						statusText,
						...infoResult.data,
					} as const
				} else {
					// don't cache errors for long...
					context.metadata.ttl = 1000 * 2 // 2 seconds
					context.metadata.swr = 0
					const restrictedResult =
						EpicVideoRegionRestrictedErrorSchema.safeParse(rawInfo)
					if (restrictedResult.success) {
						return {
							status: 'error',
							statusCode: status,
							statusText,
							type: 'region-restricted',
							...restrictedResult.data,
						} as const
					} else {
						console.warn(
							`Response from EpicWeb for "${epicUrl.pathname}" does not match expectation`,
							infoResult.error,
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
				context.metadata.ttl = 1000 * 2 // 2 seconds
				context.metadata.swr = 0
				return {
					status: 'error',
					statusCode: status,
					statusText,
					type: 'unknown',
				} as const
			}
		},
	}).catch((e) => {
		console.error(`Failed to fetch epic video info for ${epicVideoEmbed}`, e)
		throw e
	})
}

async function getEpicProgress({
	timings,
	request,
	forceFresh,
}: { timings?: Timings; request?: Request; forceFresh?: boolean } = {}) {
	if (ENV.EPICSHOP_DEPLOYED) return []
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
	return cachified({
		key: `epic-progress:${host}:${tokenPart}`,
		cache: fsCache,
		request,
		timings,
		forceFresh,
		ttl: 1000 * 2,
		swr: 1000 * 60 * 60 * 24 * 30,
		checkValue: EpicProgressSchema,
		async getFreshValue(context): Promise<z.infer<typeof EpicProgressSchema>> {
			const response = await fetch(`https://${host}/api/progress`, {
				headers: {
					authorization: `Bearer ${authInfo.tokenSet.access_token}`,
				},
			}).catch((e) => new Response(getErrorMessage(e), { status: 500 }))
			if (response.status < 200 || response.status >= 300) {
				console.error(
					`Failed to fetch progress from EpicWeb: ${response.status} ${response.statusText}`,
				)
				// don't cache errors for long...
				context.metadata.ttl = 1000 * 2 // 2 seconds
				context.metadata.swr = 0
				return []
			}
			return EpicProgressSchema.parse(await response.json())
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
	if (ENV.EPICSHOP_DEPLOYED) return []
	const authInfo = await getAuthInfo()
	if (!authInfo) return []
	const {
		product: { slug, host },
	} = getWorkshopConfig()
	if (!slug) return []

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

	for (const resource of workshopData.resources) {
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
	if (ENV.EPICSHOP_DEPLOYED) {
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

	const response = await fetch(`https://${host}/api/progress`, {
		method: 'POST',
		headers: {
			authorization: `Bearer ${authInfo.tokenSet.access_token}`,
			'content-type': 'application/json',
		},
		body: JSON.stringify(
			complete ? { lessonSlug } : { lessonSlug, remove: true },
		),
	}).catch((e) => new Response(getErrorMessage(e), { status: 500 }))
	// force the progress to be fresh whether or not we're successful
	await getEpicProgress({ forceFresh: true, request, timings })

	if (response.status < 200 || response.status >= 300) {
		return {
			status: 'error',
			error: `${response.status} ${response.statusText}`,
		} as const
	}

	return { status: 'success' } as const
}

const ModuleSchema = z.object({
	resources: z.array(
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
	),
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
	if (ENV.EPICSHOP_DEPLOYED) return { resources: [] }
	const authInfo = await getAuthInfo()
	// auth is not required, but we only use it for progress which is only needed
	// if you're authenticated anyway.
	if (!authInfo) return { resources: [] }

	const {
		product: { host },
	} = getWorkshopConfig()

	return cachified({
		key: `epic-workshop-data:${host}:${slug}`,
		cache: fsCache,
		request,
		forceFresh,
		timings,
		checkValue: ModuleSchema,
		async getFreshValue(): Promise<z.infer<typeof ModuleSchema>> {
			const response = await fetch(
				`https://${host}/api/workshops/${encodeURIComponent(slug)}`,
			).catch((e) => new Response(getErrorMessage(e), { status: 500 }))
			if (response.status < 200 || response.status >= 300) {
				console.error(
					`Failed to fetch workshop data from EpicWeb for ${slug}: ${response.status} ${response.statusText}`,
				)
				return { resources: [] }
			}
			return ModuleSchema.parse(await response.json())
		},
	})
}
