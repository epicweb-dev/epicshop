import { useLocation, useRouteLoaderData } from '@remix-run/react'
import usePartySocketDef from 'partysocket/react'
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

const usePartySocket =
	// @ts-expect-error TS + ESM + default exports = pain
	usePartySocketDef as (typeof usePartySocketDef)['default']

export function usePresencePreferences() {
	const data = useRouteLoaderData<typeof rootLoader>('root')
	return data?.preferences?.presence ?? null
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
			const messageResult = MessageSchema.safeParse(JSON.parse(evt.data))
			if (!messageResult.success) return
			if (messageResult.data.type === 'presence') {
				setUsers(messageResult.data.payload.users)
			}
		},
	})
	useEffect(() => {
		if (!user) return

		if (prefs?.optOut) {
			// optimistic UI...
			setUsers(currentUsers => currentUsers.filter(u => u.id !== user.id))
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
	}, [user, socket, prefs?.optOut])
	return { users }
}
