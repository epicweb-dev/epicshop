import { z } from 'zod'

export const partykitRoom = 'epic-web-presence'
// export const partykitBaseUrl = `http://127.0.0.1:1999/parties/main/${partykitRoom}`
export const partykitBaseUrl = `https://epic-web-presence.kentcdodds.partykit.dev/parties/main/${partykitRoom}`

export const UserSchema = z.object({
	id: z.string(),
	avatarUrl: z.string(),
	name: z.string().nullable().optional(),
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
