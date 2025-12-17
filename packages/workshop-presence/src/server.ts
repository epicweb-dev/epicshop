import type * as Party from 'partykit/server'
import { z } from 'zod'
import { UserSchema } from './presence.ts'

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

	readonly party: Party.Room

	constructor(party: Party.Room) {
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
		return {
			type: 'presence',
			payload: { users: this.getUsers() },
		} satisfies Message
	}

	getUsers() {
		const users = new Map<string, z.infer<typeof UserSchema>>()

		for (const connection of this.party.getConnections()) {
			const state = getConnectionState(connection)
			if (state?.user) {
				users.set(state.user.id, state.user)
			}
		}

		return sortUsers(Array.from(users.values()))
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
		if (url.pathname.endsWith('/show')) {
			const users = this.getUsers()
			const workshopUsers = organizeUsersByWorkshop(users)
			return new Response(
				`
				<!DOCTYPE html>
				<html lang="en">
				<head>
					<meta charset="UTF-8">
					<meta name="viewport" content="width=device-width, initial-scale=1.0">
					<meta http-equiv="refresh" content="5">
					<title>Epic Web Presence</title>
					<style>
						body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
						h1, h2 { color: #333; }
						ul { padding: 0; }
						li { list-style: none; margin-bottom: 10px; }
						.user-avatar { width: 64px; height: 64px; border-radius: 50%; vertical-align: middle; margin-right: 10px; }
					</style>
				</head>
				<body>
					<h1>Epic Web Presence</h1>
					<p>Total Users: ${users.length}</p>
					${Object.entries(workshopUsers)
						.map(
							([workshop, workshopUsers]) => `
							<h2>${workshop} (${workshopUsers.length})</h2>
							<ul>
								${workshopUsers.map(generateUserListItem).join('')}
							</ul>
						`,
						)
						.join('')}
				</body>
				</html>
				`,
				{
					headers: {
						'Content-Type': 'text/html',
					},
				},
			)
		}
		return new Response('not found', { status: 404 })
	}
} satisfies Party.Worker)

function shallowMergeConnectionState(
	connection: Party.Connection,
	state: ConnectionState,
) {
	setConnectionState(connection, (prev) => ({ ...prev, ...state }))
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
	connection.setState((prev: unknown) => {
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
	if (user.imageUrlSmall) score += 1
	if (user.imageUrlSmall?.includes('discordapp')) score += 0.5
	if (user.name) score += 1
	return score
}

function organizeUsersByWorkshop(users: Array<User>) {
	const workshopUsers: Record<string, Array<User>> = {}

	for (const user of users) {
		const workshop = user.location?.workshopTitle ?? 'Unknown Workshop'
		if (!workshopUsers[workshop]) {
			workshopUsers[workshop] = []
		}
		workshopUsers[workshop]?.push(user)
	}

	// Sort users within each workshop by exercise and step number
	for (const workshop in workshopUsers) {
		workshopUsers[workshop]?.sort((a, b) => {
			const aExercise = a.location?.exercise?.exerciseNumber ?? 0
			const bExercise = b.location?.exercise?.exerciseNumber ?? 0
			if (aExercise !== bExercise) return aExercise - bExercise

			const aStep = a.location?.exercise?.stepNumber ?? 0
			const bStep = b.location?.exercise?.stepNumber ?? 0
			return aStep - bStep
		})
	}

	return workshopUsers
}

function generateUserListItem(user: User) {
	const imageUrl = user.imageUrlLarge ?? user.avatarUrl ?? '/avatar.png'
	const name = user.name ?? 'Anonymous'
	const location = user.location?.exercise
		? [
				`Exercise ${user.location.exercise.exerciseNumber}`,
				user.location.exercise.stepNumber &&
					`Step ${user.location.exercise.stepNumber}`,
			]
				.filter(Boolean)
				.join(', ')
		: user.location?.origin
			? user.location.origin
			: 'Unknown location'

	const accessLabel =
		typeof user.hasAccess === 'boolean' ? (user.hasAccess ? '🔑' : '🆓') : ''

	return `
		<li>
			<img class="user-avatar" src="${imageUrl}" alt="${name}" />
			<strong>${name}</strong> - ${location} ${accessLabel}
		</li>
	`
}
