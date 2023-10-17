import type * as Party from 'partykit/server'
import { z } from 'zod'

const UserPayloadSchema = z.object({
	id: z.string(),
	avatarUrl: z.string(),
	name: z.string().nullable().optional(),
})

const ConnectionStateSchema = z
	.object({
		user: UserPayloadSchema.nullable().optional(),
	})
	.nullable()

type ConnectionState = z.infer<typeof ConnectionStateSchema>

const MessageSchema = z
	.object({
		type: z.literal('remove-user'),
		payload: z.object({ id: z.string() }),
	})
	.or(z.object({ type: z.literal('add-user'), payload: UserPayloadSchema }))
	.or(
		z.object({
			type: z.literal('presence'),
			payload: z.object({ users: z.array(UserPayloadSchema) }),
		}),
	)
type Message = z.infer<typeof MessageSchema>

export default (class Server implements Party.Server {
	options: Party.ServerOptions = {
		hibernate: true,
	}

	constructor(readonly party: Party.Party) {
		this.party = party
	}

	onClose() {
		this.updateUsers()
	}

	onError() {
		this.updateUsers()
	}

	updateUsers() {
		const presenceMessage = JSON.stringify(this.getPresenceMessage())
		for (const connection of this.party.getConnections()) {
			connection.send(presenceMessage)
		}
	}

	getPresenceMessage() {
		const users = new Map<string, z.infer<typeof UserPayloadSchema>>()

		for (const connection of this.party.getConnections()) {
			const state = getConnectionState(connection)
			if (state?.user) {
				users.set(state.user.id, state.user)
			}
		}

		return {
			type: 'presence',
			payload: { users: Array.from(users.values()) },
		} satisfies Message
	}

	onMessage(message: string, sender: Party.Connection) {
		const result = MessageSchema.safeParse(JSON.parse(message))
		if (!result.success) return

		if (result.data.type === 'add-user') {
			shallowMergeConnectionState(sender, { user: result.data.payload })
			this.updateUsers()
		} else if (result.data.type === 'remove-user') {
			setConnectionState(sender, null)
			this.updateUsers()
		}
	}

	onRequest(req: Party.Request): Response | Promise<Response> {
		const url = new URL(req.url)
		if (url.pathname.endsWith('/presence')) {
			return Response.json(this.getPresenceMessage().payload)
		}
		return new Response('not found', { status: 404 })
	}
} satisfies Party.Worker)

function shallowMergeConnectionState(
	connection: Party.Connection,
	state: ConnectionState,
) {
	setConnectionState(connection, prev => ({ ...prev, ...state }))
}

function setConnectionState(
	connection: Party.Connection,
	state:
		| ConnectionState
		| ((prev: ConnectionState | null) => ConnectionState | null),
) {
	if (typeof state !== 'function') {
		return connection.setState(state)
	}
	connection.setState((prev: any) => {
		const prevParseResult = ConnectionStateSchema.safeParse(prev)
		if (prevParseResult.success) {
			return state(prevParseResult.data)
		} else {
			return state(null)
		}
	})
}

function getConnectionState(connection: Party.Connection) {
	const result = ConnectionStateSchema.safeParse(connection.state)
	if (result.success) {
		return result.data
	} else {
		setConnectionState(connection, null)
		return null
	}
}
