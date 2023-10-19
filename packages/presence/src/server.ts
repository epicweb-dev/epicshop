import type * as Party from 'partykit/server'
import { z } from 'zod'

const UserSchema = z.object({
	id: z.string(),
	avatarUrl: z.string().nullable().optional(),
	name: z.string().nullable().optional(),
})

type User = z.infer<typeof UserSchema>
const ConnectionStateSchema = z
	.object({
		user: UserSchema.nullable().optional(),
	})
	.nullable()

type ConnectionState = z.infer<typeof ConnectionStateSchema>

const MessageSchema = z
	.object({
		type: z.literal('remove-user'),
		payload: z.object({ id: z.string() }),
	})
	.or(z.object({ type: z.literal('add-user'), payload: UserSchema }))
	.or(
		z.object({
			type: z.literal('add-anonymous-user'),
			payload: z.object({ id: z.string() }),
		}),
	)
	.or(
		z.object({
			type: z.literal('presence'),
			payload: z.object({ users: z.array(UserSchema) }),
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
		const users = new Map<string, z.infer<typeof UserSchema>>()

		for (const connection of this.party.getConnections()) {
			const state = getConnectionState(connection)
			if (state?.user) {
				users.set(state.user.id, state.user)
			}
		}

		return {
			type: 'presence',
			payload: { users: sortUsers(Array.from(users.values())) },
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
		} else if (result.data.type === 'add-anonymous-user') {
			setConnectionState(sender, { user: result.data.payload })
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

function sortUsers(users: Array<User>) {
	return [...users].sort((a, b) => {
		const aScore = getScore(a)
		const bScore = getScore(b)
		if (aScore === bScore) return 0
		return aScore > bScore ? -1 : 1
	})
}

function getScore(user: User) {
	let score = 0
	if (user.avatarUrl) score += 1
	if (user.avatarUrl?.includes('discordapp')) score += 0.5
	if (user.name) score += 1
	return score
}
