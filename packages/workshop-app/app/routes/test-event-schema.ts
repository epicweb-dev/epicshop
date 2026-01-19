import { z } from 'zod'

export const testEventSchema = z.union([
	z.object({
		type: z.literal('init'),
		exitCode: z.number().nullable().optional(),
		isRunning: z.boolean(),
		output: z.array(
			z.object({
				type: z.union([z.literal('stdout'), z.literal('stderr')]),
				content: z.string(),
				timestamp: z.number(),
			}),
		),
	}),
	z.object({
		type: z.union([z.literal('stdout'), z.literal('stderr')]),
		data: z.string(),
		timestamp: z.number(),
	}),
	z.object({
		type: z.literal('exit'),
		isRunning: z.literal(false),
		code: z.number().nullable(),
	}),
])

export const testEventQueueSchema = z.array(testEventSchema)

export type TestEvent = z.infer<typeof testEventSchema>
export type TestEventQueue = z.infer<typeof testEventQueueSchema>
