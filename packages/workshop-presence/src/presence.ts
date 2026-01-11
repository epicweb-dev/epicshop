import { z } from 'zod'

export const partykitRoom = 'epic-web-presence'
// export const partykitBaseUrl = `http://127.0.0.1:1999/parties/main/${partykitRoom}`
export const partykitBaseUrl = `https://epic-web-presence.kentcdodds.partykit.dev/parties/main/${partykitRoom}`

export const RepoStatusSchema = z.object({
	updatesAvailable: z.boolean().nullable().optional(),
	commitsAhead: z.number().nullable().optional(),
	commitsBehind: z.number().nullable().optional(),
	localCommit: z.string().nullable().optional(),
	remoteCommit: z.string().nullable().optional(),
})

export type RepoStatus = z.infer<typeof RepoStatusSchema>

export const LocationSchema = z.object({
	workshopTitle: z.string().nullable().optional(),
	origin: z.string().nullable().optional(),
	productHost: z.string().nullable().optional(),
	exercise: z
		.object({
			type: z
				.union([z.literal('problem'), z.literal('solution')])
				.nullable()
				.optional(),
			exerciseNumber: z.number().nullable().optional(),
			stepNumber: z.number().nullable().optional(),
		})
		.nullable()
		.optional(),
	// Version of the epicshop app for this location/workshop
	epicshopVersion: z.string().nullable().optional(),
	// Repository status (updates available, commits ahead/behind) for this location/workshop
	repoStatus: RepoStatusSchema.nullable().optional(),
	// ISO timestamp of when the user last sent an update for this location (server-set)
	lastUpdatedAt: z.string().nullable().optional(),
})

export type Location = z.infer<typeof LocationSchema>

export const UserSchema = z.object({
	id: z.string(),
	hasAccess: z.boolean().nullable().optional(),
	// TODO: remove the avatarUrl field once people have updated their workshops
	avatarUrl: z.string().nullable().optional(),
	imageUrlSmall: z.string().nullable().optional(),
	imageUrlLarge: z.string().nullable().optional(),
	name: z.string().nullable().optional(),
	optOut: z.boolean().nullable().optional(),
	loggedInProductHosts: z.array(z.string()).nullable().optional(),
	// Single location (for backward compat and single-connection case)
	location: LocationSchema.nullable().optional(),
	// Multiple locations when user is connected from multiple workshops
	locations: z.array(LocationSchema).nullable().optional(),
})

export const MessageSchema = z
	.object({
		type: z.literal('remove-user'),
		payload: z.object({ id: z.string() }),
	})
	.or(z.object({ type: z.literal('add-user'), payload: UserSchema }))
	.or(
		z.object({
			type: z.literal('presence'),
			payload: z.object({ users: z.array(UserSchema) }),
		}),
	)

export type Message = z.infer<typeof MessageSchema>

export type User = z.infer<typeof UserSchema>

export const PresenceSchema = z.object({ users: z.array(UserSchema) })

// Product host to emoji mapping for FacePile badges
export const productHostEmojis: Record<string, string> = {
	'www.epicreact.dev': '🚀',
	'www.epicai.pro': '⚡',
	'www.epicweb.dev': '🌌',
}

export function getProductHostEmoji(
	host: string | null | undefined,
): string | null {
	if (!host) return null
	return productHostEmojis[host] ?? null
}
