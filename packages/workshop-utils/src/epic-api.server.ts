import * as cookie from 'cookie'
import md5 from 'md5-hex'
import { z } from 'zod'
import {
	getExercises,
	getWorkshopFinished,
	getWorkshopInstructions,
} from './apps.server.js'
import { cachified, fsCache } from './cache.server.js'
import { getWorkshopConfig } from './config.server.js'
import { getAuthInfo, setAuthInfo } from './db.server.js'
import { type Timings } from './timing.server.js'
import { getErrorMessage } from './utils.js'

const Transcript = z
	.string()
	.nullable()
	.optional()
	.transform((s) => s ?? 'Transcripts not available')
const EpicVideoInfoSchema = z.object({
	title: z.string().nullable().optional(),
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
		title: z.string().nullable().optional(),
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
		swr: 1000 * 60 * 60 * 24 * 365 * 10,
		offlineFallbackValue: null,
		checkValue: CachedEpicVideoInfoSchema,
		async getFreshValue(
			context,
		): Promise<z.infer<typeof CachedEpicVideoInfoSchema>> {
			const epicUrl = new URL(epicVideoEmbed)
			if (
				epicUrl.host !== 'www.epicweb.dev' &&
				epicUrl.host !== 'www.epicreact.dev' &&
				epicUrl.host !== 'www.epicai.pro'
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

			// special case for epicai.pro videos
			const apiUrl =
				epicUrl.host === 'www.epicai.pro'
					? getEpicAIVideoAPIUrl(epicVideoEmbed)
					: `https://${epicUrl.host}/api${epicUrl.pathname}`

			const infoResponse = await fetch(
				apiUrl,
				accessToken
					? { headers: { authorization: `Bearer ${accessToken}` } }
					: undefined,
			)
			const { status, statusText } = infoResponse
			if (infoResponse.status >= 200 && infoResponse.status < 300) {
				let rawInfo = await infoResponse.json()
				// another special case for epicai.pro videos
				if (epicUrl.host === 'www.epicai.pro') {
					rawInfo = preprocessEpicAIVideoAPIResult(rawInfo)
				}
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
					context.metadata.ttl = 1000 * 2
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
				context.metadata.ttl = 1000 * 2
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

function getEpicAIVideoAPIUrl(epicVideoEmbed: string) {
	const epicUrl = new URL(epicVideoEmbed)
	const slug = epicUrl.pathname.split('/').at(-1)!
	return `https://epicai.pro/api/posts?slugOrId=${slug}`
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
		swr: 1000 * 60 * 60 * 24 * 365 * 10,
		offlineFallbackValue: [],
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
				context.metadata.ttl = 1000 * 2
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
		offlineFallbackValue: { resources: [] },
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
			const jsonResponse = await response.json()
			return ModuleSchema.parse(jsonResponse)
		},
	})
}

export async function userHasAccessToWorkshop({
	timings,
	request,
	forceFresh,
}: {
	request?: Request
	timings?: Timings
	forceFresh?: boolean
} = {}) {
	const config = getWorkshopConfig()
	const {
		product: { host, slug },
	} = config
	if (!slug) return true

	if (ENV.EPICSHOP_DEPLOYED) {
		const cookieHeader = request?.headers.get('Cookie')
		if (!cookieHeader) return false
		const cookies = cookie.parse(cookieHeader)
		return cookies.skill?.split(',').includes(slug) ?? false
	}

	const authInfo = await getAuthInfo()
	if (!authInfo) return false

	return cachified({
		key: `user-has-access-to-workshop:${host}:${slug}`,
		cache: fsCache,
		request,
		forceFresh,
		timings,
		ttl: 1000 * 5,
		offlineFallbackValue: false,
		checkValue: z.boolean(),
		async getFreshValue(context) {
			const response = await fetch(
				`https://${host}/api/workshops/${encodeURIComponent(slug)}/access`,
				{
					headers: {
						authorization: `Bearer ${authInfo.tokenSet.access_token}`,
					},
				},
			).catch((e) => new Response(getErrorMessage(e), { status: 500 }))
			const hasAccess = response.ok ? (await response.json()) === true : false

			if (hasAccess) {
				context.metadata.ttl = 1000 * 60 * 5
				context.metadata.swr = 1000 * 60 * 60 * 24 * 365 * 10
			}

			return hasAccess
		},
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
				nick: z.string().nullable(),
				user: z.object({
					id: z.string(),
					username: z.string(),
					avatar: z.string().nullable().optional(),
					global_name: z.string().nullable().optional(),
				}),
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

	const userInfo = await cachified({
		key: `${url}:${md5(accessToken)}`,
		cache: fsCache,
		request,
		forceFresh,
		timings,
		ttl: 1000 * 30,
		swr: 1000 * 60 * 60 * 24 * 365 * 10,
		offlineFallbackValue: null,
		checkValue: UserInfoSchema,
		async getFreshValue(): Promise<UserInfo> {
			const response = await fetch(url, {
				headers: { authorization: `Bearer ${accessToken}` },
			}).catch((e) => new Response(getErrorMessage(e), { status: 500 }))

			if (!response.ok) {
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
			return UserInfoSchema.parse(data)
		},
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
