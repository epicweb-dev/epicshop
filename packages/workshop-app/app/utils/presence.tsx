import { type loader as rootLoader } from '#app/root.tsx'
import {
	MessageSchema,
	partykitBaseUrl,
	partykitRoom,
	type Message,
	type User,
} from '@epic-web/workshop-presence/presence'
import { createId as cuid } from '@paralleldrive/cuid2'
import { useParams, useRouteLoaderData } from '@remix-run/react'
import { usePartySocket } from 'partysocket/react'
import { createContext, useContext, useEffect, useState } from 'react'
import { z } from 'zod'
import { useRequestInfo } from './request-info.ts'

export * from '@epic-web/workshop-presence/presence'

const PresenceContext = createContext<ReturnType<
	typeof usePresenceSocket
> | null>(null)

export function usePresencePreferences() {
	const data = useRouteLoaderData<typeof rootLoader>('root')
	return data?.preferences?.presence ?? null
}

export function useOptionalWorkshopTitle() {
	const data = useRouteLoaderData<typeof rootLoader>('root')
	return data?.workshopTitle ?? null
}

const ExerciseAppParamsSchema = z.object({
	type: z.union([z.literal('problem'), z.literal('solution')]).optional(),
	exerciseNumber: z.coerce.number().finite(),
	stepNumber: z.coerce.number().finite().optional(),
})

export function usePresenceSocket(user?: User | null) {
	const workshopTitle = useOptionalWorkshopTitle()
	const requestInfo = useRequestInfo()
	const rawParams = useParams()
	const prefs = usePresencePreferences()
	const data = useRouteLoaderData<typeof rootLoader>('root')
	const [users, setUsers] = useState(data?.presence.users ?? [])
	const [clientId] = useState(() => {
		if (typeof document === 'undefined') return null
		if (user) return user.id
		const clientId = sessionStorage.getItem('clientId')
		if (clientId) return clientId
		const newClientId = cuid()
		sessionStorage.setItem('clientId', newClientId)
		return newClientId
	})

	const socket = usePartySocket({
		host: new URL(partykitBaseUrl).host,
		room: partykitRoom,
		onMessage(evt: MessageEvent) {
			const messageResult = MessageSchema.safeParse(
				JSON.parse(String(evt.data)),
			)
			if (!messageResult.success) return
			if (messageResult.data.type === 'presence') {
				setUsers(messageResult.data.payload.users)
			}
		},
	})

	const paramsResult = ExerciseAppParamsSchema.safeParse(rawParams)
	const params = paramsResult.success ? paramsResult.data : null
	const location = {
		workshopTitle,
		origin: requestInfo.origin,
		...(params
			? {
					exercise: {
						type: params.type,
						exerciseNumber: params.exerciseNumber,
						stepNumber: params.stepNumber,
					},
				}
			: null),
	} satisfies User['location']

	let message: Message | null = null
	if ((!user || prefs?.optOut) && clientId) {
		if (user) {
			message = { type: 'remove-user', payload: { id: user.id } }
		}
		message = { type: 'add-user', payload: { id: clientId, location } }
	} else if (user) {
		message = {
			type: 'add-user',
			payload: {
				id: user.id,
				name: user.name,
				avatarUrl: user.avatarUrl,
				location,
			},
		}
	}

	const messageJson = message ? JSON.stringify(message) : null
	useEffect(() => {
		if (messageJson) socket.send(messageJson)
	}, [messageJson, socket])

	const scoredUsers = scoreUsers(location, users)

	return { users: scoredUsers }
}

function scoreUsers(location: User['location'], users: Array<User>) {
	const scoredUsers = users.map(user => {
		let score = 0
		const available = 4
		if (location?.workshopTitle === user.location?.workshopTitle) {
			score += 1
			if (
				location?.exercise?.exerciseNumber &&
				location.exercise.exerciseNumber ===
					user.location?.exercise?.exerciseNumber
			) {
				score += 1
				if (
					location.exercise.stepNumber &&
					location.exercise.stepNumber === user.location.exercise.stepNumber
				) {
					score += 1
					if (
						location.exercise.type &&
						location.exercise.type === user.location.exercise.type
					) {
						score += 1
					}
				}
			}
		}

		return { user, score: Math.floor((score / available) * 10) / 10 }
	})
	return scoredUsers.sort((a, b) => {
		if (a.score === b.score) return 0
		return a.score > b.score ? -1 : 1
	})
}

export function Presence({
	user,
	children,
}: {
	user?: User | null
	children: React.ReactNode
}) {
	return (
		<PresenceContext.Provider value={usePresenceSocket(user)}>
			{children}
		</PresenceContext.Provider>
	)
}

export function usePresence() {
	const presence = useContext(PresenceContext)
	if (!presence) {
		throw new Error('usePresence must be used within a PresenceProvider')
	}
	return presence
}
