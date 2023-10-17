import type * as Party from 'partykit/server'

type UserPayload = {
	id: string
	avatarUrl: string
	name?: string | null | undefined
}

type Message =
	| { type: 'remove-user'; payload: Pick<UserPayload, 'id'> }
	| { type: 'add-user'; payload: UserPayload }
	| { type: 'presence'; payload: { users: Array<UserPayload> } }

export default class Server implements Party.Server {
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
		for (const connection of this.party.getConnections<UserPayload>()) {
			connection.send(presenceMessage)
		}
	}

	getPresenceMessage(): Message {
		const users = new Map<string, UserPayload>()

		for (const connection of this.party.getConnections<UserPayload>()) {
			const user = connection.state
			if (user) users.set(user.id, user)
		}

		return {
			type: 'presence',
			payload: { users: Array.from(users.values()) },
		} satisfies Message
	}

	onMessage(message: string, sender: Party.Connection<UserPayload>) {
		const user = JSON.parse(message) as Message

		if (user.type === 'add-user') {
			sender.setState(user.payload)
			this.updateUsers()
		} else if (user.type === 'remove-user') {
			sender.setState(null)
			this.updateUsers()
		}
	}

	onRequest(req: Party.Request): Response | Promise<Response> {
		if (req.method === 'POST') {
			return Response.json(this.getPresenceMessage().payload)
		}
		return new Response('Not found', { status: 404 })
	}
}

Server satisfies Party.Worker
