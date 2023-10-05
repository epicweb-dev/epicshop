import { type DataFunctionArgs } from '@remix-run/node'
import { eventStream } from 'remix-utils/event-stream'
import { z } from 'zod'
import { EVENTS } from '~/utils/auth-events.ts'
import { authEmitter } from '~/utils/auth.server.ts'
import { ensureUndeployed } from '~/utils/misc.tsx'

const CodeReceivedEventSchema = z.object({
	type: z.literal(EVENTS.USER_CODE_RECEIVED),
	code: z.string(),
	url: z.string(),
})
const AuthResolvedEventSchema = z.object({
	type: z.literal(EVENTS.AUTH_RESOLVED),
})
export const EventSchema = z.union([
	CodeReceivedEventSchema,
	AuthResolvedEventSchema,
])

export async function loader({ request }: DataFunctionArgs) {
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
		authEmitter.on(EVENTS.USER_CODE_RECEIVED, handleCodeReceived)
		authEmitter.on(EVENTS.AUTH_RESOLVED, handleAuthResolved)
		return () => {
			authEmitter.off(EVENTS.USER_CODE_RECEIVED, handleCodeReceived)
			authEmitter.off(EVENTS.AUTH_RESOLVED, handleAuthResolved)
		}
	})
}
