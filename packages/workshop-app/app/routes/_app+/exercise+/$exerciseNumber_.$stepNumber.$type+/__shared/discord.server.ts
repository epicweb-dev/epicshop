import {
	cachified,
	fsCache,
	shouldForceFresh,
} from '@epic-web/workshop-utils/cache.server'
import { getWorkshopConfig } from '@epic-web/workshop-utils/config.server'
import { z } from 'zod'

const EmojiDataSchema = z.union([
	z.object({
		emojiName: z.never().optional(),
		emojiUrl: z.string(),
	}),
	z.object({
		emojiName: z.string(),
		emojiUrl: z.never().optional(),
	}),
	z.object({
		emojiName: z.never().optional(),
		emojiUrl: z.never().optional(),
	}),
])

export const ThreadItemSchema = z.object({
	id: z.string(),
	tags: z.array(
		z
			.object({
				name: z.string(),
			})
			.and(EmojiDataSchema),
	),
	name: z.string(),
	link: z.string(),
	authorDisplayName: z.string(),
	authorHexAccentColor: z.string().nullable().optional(),
	authorAvatarUrl: z.string().nullable(),
	messagePreview: z.string(),
	messageCount: z.number(),
	lastUpdated: z.string(),
	previewImageUrl: z.string().nullable(),
	reactions: z.array(
		z
			.object({
				count: z.number(),
			})
			.and(EmojiDataSchema),
	),
})

const ThreadDataSchema = z.array(ThreadItemSchema)

const EpicForumResponseSchema = z
	.object({
		status: z.literal('error'),
		error: z.string(),
	})
	.or(
		z.object({
			status: z.literal('success'),
			threadData: ThreadDataSchema,
		}),
	)

export async function fetchDiscordPosts({ request }: { request: Request }) {
	const config = getWorkshopConfig()
	const forceFresh = await shouldForceFresh({ request })
	const searchParams = new URLSearchParams({
		channelId: config.product.discordChannelId,
	})
	if (config.product.discordTags?.length) {
		for (const tag of config.product.discordTags) {
			searchParams.append('tagId', tag)
		}
	}
	if (forceFresh) searchParams.set('fresh', 'true')
	// const url = `http://localhost:3000/resources/forum-feed?${searchParams}`
	const url = `https://kcd-discord-bot-v2.fly.dev/resources/forum-feed?${searchParams}`

	return cachified({
		key: url,
		request,
		forceFresh,
		cache: fsCache,
		ttl: 1000 * 60 * 2,
		swr: 1000 * 60 * 60 * 24 * 7,
		checkValue: ThreadDataSchema,
		async getFreshValue(): Promise<z.infer<typeof ThreadDataSchema>> {
			const result = await fetch(url, {
				headers: { 'content-type': 'application/json' },
			})

			if (!result.ok) {
				console.error(`There was an error communicating with discord`)
				try {
					console.error(await result.text())
				} catch {
					// ignore
				}
				return []
			}

			const jsonResult = await result.json()
			const epicForumResponseResult =
				EpicForumResponseSchema.safeParse(jsonResult)
			if (epicForumResponseResult.success) {
				if (epicForumResponseResult.data.status === 'error') {
					console.error(`There was an error communicating with discord`)
					console.error(epicForumResponseResult.data.error)
					return []
				} else {
					return epicForumResponseResult.data.threadData
				}
			} else {
				console.error(`There was an error parsing the discord response`)
				console.error(epicForumResponseResult.error.flatten())
				return []
			}
		},
	})
}
