import { useLocation } from '@remix-run/react'

import usePartySocket from 'partysocket/react'
import { useEffect, useState } from 'react'

export type User = {
	name?: string | null | undefined
	email: string
	gravatarUrl: string
	location?: string
}

export type Message =
	| {
			type: 'user'
			payload: User
	  }
	| {
			type: 'presence'
			payload: Presence
	  }
	| {
			type: 'globalPresence'
			payload: GlobalPresence
	  }

export type Presence = {
	location: string
	users: User[]
}

export type GlobalPresence = {
	allUsers: number
	thisWeek: number
	thisMonth: number
}

// A user maybe on the same page in multiple tabs
// so let's make sure we only show them once
function uniqueUsers(users: User[]) {
	const seen = new Set()
	return users.filter(user => {
		if (seen.has(user.email)) {
			return false
		}
		seen.add(user.email)
		return true
	})
}

export function usePresence(user: User | null | undefined) {
	const location = useLocation()
	const [users, setUsers] = useState<User[]>([])
	const [globalPresence, setGlobalPresence] = useState<GlobalPresence | null>(
		null,
	)
	// @ts-expect-error remix doesn't appear to be pickeing up
	// the default export
	const socket = usePartySocket({
		// host: 'localhost:1999',
		host: 'epic-web-presence.threepointone.partykit.dev',
		room: 'epic-web-presence',
		onMessage(evt: MessageEvent) {
			const message = JSON.parse(evt.data) as Message
			if (message.type === 'presence') {
				setUsers(uniqueUsers(message.payload.users))
			} else if (message.type === 'globalPresence') {
				setGlobalPresence(message.payload)
			}
		},
	})
	useEffect(() => {
		socket.send(
			JSON.stringify({
				type: 'user',
				payload: { ...user, location: location.pathname } as User,
			}),
		)
	}, [user, socket, location])
	return { users, globalPresence }
}
