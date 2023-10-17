import { useLocation, useRouteLoaderData } from '@remix-run/react'
import usePartySocketDef from 'partysocket/react'
import { useEffect, useState } from 'react'
import { z } from 'zod'
import { type loader as rootLoader } from '#app/root.tsx'
import { getPreferences } from '#app/utils/db.server.ts'

const partykitRoom = 'epic-web-presence'
// const partykitBaseUrl = `http://127.0.0.1:1999/parties/main/${partykitRoom}`
const partykitBaseUrl = `https://epic-web-presence.kentcdodds.partykit.dev/parties/main/${partykitRoom}`

const usePartySocket =
	// @ts-expect-error TS + ESM + default exports = pain
	usePartySocketDef as (typeof usePartySocketDef)['default']

export function usePresencePreferences() {
	const data = useRouteLoaderData<typeof rootLoader>('root')
	return data?.preferences?.presence ?? null
}

const UserSchema = z.object({
	id: z.string(),
	avatarUrl: z.string(),
	name: z.string().nullable().optional(),
})

const MessageSchema = z
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
type Message = z.infer<typeof MessageSchema>

type User = z.infer<typeof UserSchema>

const PresenceSchema = z.object({ users: z.array(UserSchema) })

export async function getPresentUsers(user?: User | null) {
	try {
		const response = await fetch(`${partykitBaseUrl}/presence`)
		const presence = PresenceSchema.parse(await response.json())
		const preferences = await getPreferences()
		const users = presence.users
		if (preferences?.presence.optOut || !user) {
			return uniqueUsers(users.filter(u => u.id !== user?.id))
		} else {
			return uniqueUsers([...users, user])
		}
	} catch (err) {
		return []
	}
}

// A user maybe on the same page in multiple tabs
// so let's make sure we only show them once
function uniqueUsers(users: Array<User>) {
	const seen = new Set()
	return users.filter(user => {
		if (seen.has(user.id)) {
			return false
		}
		seen.add(user.id)
		return true
	})
}

export function usePresence(user?: User | null) {
	const prefs = usePresencePreferences()
	const location = useLocation()
	const data = useRouteLoaderData<typeof rootLoader>('root')
	const [users, setUsers] = useState(data?.presence.users ?? [])

	const socket = usePartySocket({
		host: new URL(partykitBaseUrl).host,
		room: partykitRoom,
		onMessage(evt: MessageEvent) {
			const message = JSON.parse(evt.data) as Message
			if (message.type === 'presence') {
				setUsers(uniqueUsers(message.payload.users))
			}
		},
	})
	useEffect(() => {
		if (!user) return

		if (prefs?.optOut) {
			socket.send(
				JSON.stringify({
					type: 'remove-user',
					payload: { id: user?.id },
				} satisfies Message),
			)
		} else {
			socket.send(
				JSON.stringify({
					type: 'add-user',
					payload: { id: user.id, name: user.name, avatarUrl: user.avatarUrl },
				} satisfies Message),
			)
		}
	}, [user, socket, location, prefs?.optOut])
	return { users }
}
