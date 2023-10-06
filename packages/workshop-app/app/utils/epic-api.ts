import md5 from 'md5-hex'
import { z } from 'zod'
import { cachified, fsCache } from './cache.server.ts'
import { getAuthInfo } from './db.server.ts'
import { type Timings } from './timing.server.ts'

const EpicVideoInfoSchema = z.object({
	transcript: z.string(),
	muxPlaybackId: z.string(),
})

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
	if (ENV.KCDSHOP_DEPLOYED) return {}

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
		ttl: 1000 * 60 * 60, // 1 hour
		swr: 1000 * 60 * 60 * 24 * 30, // 30 days
		async getFreshValue(context) {
			const epicWebUrl = new URL(epicVideoEmbed)
			if (epicWebUrl.host !== 'www.epicweb.dev') return null

			const infoResponse = await fetch(
				`https://www.epicweb.dev/api${epicWebUrl.pathname}`,
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
					console.warn(
						`Response from EpicWeb for "${epicWebUrl.pathname}" does not match expectation`,
						infoResult.error,
					)
					return {
						status: 'error',
						statusCode: 500,
						statusText: 'API Data Type Mismatch',
					} as const
				}
			} else {
				// don't cache errors for long...
				context.metadata.ttl = 1000 * 2 // 2 seconds
				context.metadata.swr = 0
				return { status: 'error', statusCode: status, statusText } as const
			}
		},
	})
}
