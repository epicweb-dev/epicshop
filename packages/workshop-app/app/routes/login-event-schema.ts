import { z } from 'zod'
import { EVENTS } from '#app/utils/auth-events.ts'

export const CodeReceivedEventSchema = z.object({
	type: z.literal(EVENTS.USER_CODE_RECEIVED),
	code: z.string(),
	url: z.string(),
})

export const AuthResolvedEventSchema = z.object({
	type: z.literal(EVENTS.AUTH_RESOLVED),
})

export const AuthRejectedEventSchema = z.object({
	type: z.literal(EVENTS.AUTH_REJECTED),
	error: z.string().optional().default('Unknown error'),
})

export const EventSchema = z.union([
	CodeReceivedEventSchema,
	AuthResolvedEventSchema,
	AuthRejectedEventSchema,
])
