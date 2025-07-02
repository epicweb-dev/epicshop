import { type LoaderFunctionArgs } from 'react-router'
import { eventStream } from 'remix-utils/sse/server'
import { z } from 'zod'
import { EVENTS } from '#app/utils/auth-events.ts'
import { authEmitter } from '#app/utils/auth.server.ts'
import { ensureUndeployed } from '#app/utils/misc.tsx'

const CodeReceivedEventSchema = z.object({
	type: z.literal(EVENTS.USER_CODE_RECEIVED),
	code: z.string(),
	url: z.string(),
})
const AuthResolvedEventSchema = z.object({
	type: z.literal(EVENTS.AUTH_RESOLVED),
})
const AuthRejectedEventSchema = z.object({
	type: z.literal(EVENTS.AUTH_REJECTED),
	error: z.string().optional().default('Unknown error'),
})
export const EventSchema = z.union([
	CodeReceivedEventSchema,
	AuthResolvedEventSchema,
	AuthRejectedEventSchema,
])

export async function loader({ request }: LoaderFunctionArgs) {
	ensureUndeployed()
	return eventStream(request.signal, function setup(send) {
		function handleCodeReceived(data: any) {
			send({
				data: JSON.stringify(
					CodeReceivedEventSchema.parse({
						type: EVENTS.USER_CODE_RECEIVED,
						...data,
					}),
				),
			})
		}
		function handleAuthResolved() {
			send({ data: JSON.stringify({ type: EVENTS.AUTH_RESOLVED }) })
		}
		function handleAuthRejected(data: any) {
			const result = AuthRejectedEventSchema.safeParse({
				type: EVENTS.AUTH_REJECTED,
				...data,
			})
			if (result.success) {
				send({ data: JSON.stringify(result.data) })
			} else {
				console.error('Error parsing auth rejected event', result.error, data)
			}
		}
		authEmitter.on(EVENTS.USER_CODE_RECEIVED, handleCodeReceived)
		authEmitter.on(EVENTS.AUTH_RESOLVED, handleAuthResolved)
		authEmitter.on(EVENTS.AUTH_REJECTED, handleAuthRejected)
		return () => {
			authEmitter.off(EVENTS.USER_CODE_RECEIVED, handleCodeReceived)
			authEmitter.off(EVENTS.AUTH_RESOLVED, handleAuthResolved)
			authEmitter.off(EVENTS.AUTH_REJECTED, handleAuthRejected)
		}
	})
}
