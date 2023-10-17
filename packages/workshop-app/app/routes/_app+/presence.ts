import { useLocation, useRouteLoaderData } from '@remix-run/react'
import usePartySocketDef from 'partysocket/react'
import { useEffect, useState } from 'react'
import { type useUser } from '#app/components/user.tsx'
import { type loader as rootLoader } from '#app/root.tsx'

const usePartySocket =
	// @ts-expect-error TS + ESM + default exports = pain
	usePartySocketDef as (typeof usePartySocketDef)['default']

export function usePresencePreferences() {
	const data = useRouteLoaderData<typeof rootLoader>('root')
	return data?.preferences?.presence ?? null
}

type User = Pick<ReturnType<typeof useUser>, 'id' | 'name' | 'avatarUrl'>

export async function getPresentUsers(): Promise<User[]> {
	try {
		const presence = (await fetch(
			// 'http://127.0.0.1:1999/parties/main/epic-web-presence/presence',
			'https://epic-web-presence.kentcdodds.partykit.dev/parties/main/epic-web-presence/presence',
			{
				headers: {
					'Content-Type': 'application/json',
				},
			},
		).then(res => res.json())) as Presence
		return presence.users
	} catch (err) {
		console.error('failed to get presence', err)
		return []
	}
}

export type Message =
	| { type: 'remove-user'; payload: Pick<User, 'id'> }
	| { type: 'add-user'; payload: User }
	| { type: 'presence'; payload: Presence }

export type Presence = { users: Array<User> }

// A user maybe on the same page in multiple tabs
// so let's make sure we only show them once
function uniqueUsers(users: User[]) {
	const seen = new Set()
	return users.filter(user => {
		if (seen.has(user.id)) {
			return false
		}
		seen.add(user.id)
		return true
	})
}

export function usePresence(user: User | null | undefined) {
	const prefs = usePresencePreferences()
	const location = useLocation()
	const data = useRouteLoaderData<typeof rootLoader>('root')
	const [users, setUsers] = useState<User[]>(data.presence.users)

	const socket = usePartySocket({
		// host: '127.0.0.1:1999',
		host: 'epic-web-presence.kentcdodds.partykit.dev',
		room: 'epic-web-presence',
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
