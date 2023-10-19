import { useRouteLoaderData } from '@remix-run/react'
import { usePartySocket } from 'partysocket/react'
import { useEffect, useState } from 'react'
import { type loader as rootLoader } from '#app/root.tsx'
import {
	MessageSchema,
	type Message,
	type User,
	partykitRoom,
	partykitBaseUrl,
} from '../../utils/presence.ts'

export * from '../../utils/presence.ts'

export function usePresencePreferences() {
	const data = useRouteLoaderData<typeof rootLoader>('root')
	return data?.preferences?.presence ?? null
}

export function usePresence(user?: User | null) {
	const prefs = usePresencePreferences()
	const data = useRouteLoaderData<typeof rootLoader>('root')
	const [users, setUsers] = useState(data?.presence.users ?? [])
	const [clientId] = useState(() => {
		if (typeof document === 'undefined') return null
		if (user) return user.id
		const clientId = sessionStorage.getItem('clientId')
		if (clientId) return clientId
		const newClientId = Math.random().toString(36).slice(2)
		sessionStorage.setItem('clientId', newClientId)
		return newClientId
	})

	const socket = usePartySocket({
		host: new URL(partykitBaseUrl).host,
		room: partykitRoom,
		onMessage(evt: MessageEvent) {
			const messageResult = MessageSchema.safeParse(JSON.parse(evt.data))
			if (!messageResult.success) return
			if (messageResult.data.type === 'presence') {
				setUsers(messageResult.data.payload.users)
			}
		},
	})

	useEffect(() => {
		if ((!user || prefs?.optOut) && clientId) {
			if (user) {
				socket.send(
					JSON.stringify({
						type: 'remove-user',
						payload: { id: user?.id },
					} satisfies Message),
				)
			}
			socket.send(
				JSON.stringify({
					type: 'add-user',
					payload: { id: clientId },
				} satisfies Message),
			)
		} else if (user) {
			socket.send(
				JSON.stringify({
					type: 'add-user',
					payload: { id: user.id, name: user.name, avatarUrl: user.avatarUrl },
				} satisfies Message),
			)
		}
	}, [user, clientId, socket, prefs?.optOut])
	return { users }
}
