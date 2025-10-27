import {
	MessageSchema,
	partykitBaseUrl,
	partykitRoom,
	type Message,
	type User,
} from '@epic-web/workshop-presence/presence'
import { usePartySocket } from 'partysocket/react'
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
} from 'react'
import { useParams } from 'react-router'
import { z } from 'zod'
import { useIsOnline } from './online.ts'
import { useRequestInfo, useRootLoaderData } from './root-loader.ts'

export * from '@epic-web/workshop-presence/presence'

const PresenceContext = createContext<ReturnType<
	typeof usePresenceSocket
> | null>(null)

export function usePresencePreferences() {
	const data = useRootLoaderData()
	return data?.preferences?.presence ?? null
}

export function useOptionalWorkshopTitle() {
	const data = useRootLoaderData()
	return data?.workshopTitle ?? null
}

const ExerciseAppParamsSchema = z.object({
	type: z.union([z.literal('problem'), z.literal('solution')]).optional(),
	exerciseNumber: z.coerce.number().finite(),
	stepNumber: z.coerce.number().finite().optional(),
})

/**
 * useFirstCallDelayedCallback
 *
 * This hook creates a callback that is delayed on its first call.
 * It's useful for scenarios where you want to delay the execution of a function
 * for a certain amount of time, but only on the initial call.
 *
 * If it's called again before the delay expires, then the prior call is ignored
 * and when the delay expires, the latest call is executed.
 *
 * The motivation here is that the server may get one set of presence and by the
 * time it shows up on the client it's stale. This delays the re-rendering of
 * the UI to avoid a flicker as soon as you land on the page.
 *
 * @param cb The callback function to be delayed
 * @param delay The delay in milliseconds before the callback is executed
 * @returns A new function that wraps the original callback with the delay logic
 */
function useFirstCallDelayedCallback<Args extends unknown[]>(
	cb: (...args: Args) => void,
	delay: number,
) {
	const [timedPromise] = useState(
		() => new Promise((resolve) => setTimeout(resolve, delay)),
	)
	const mounted = useRef(true)
	const currentCallRef = useRef<symbol | null>(null)
	const lastCbRef = useRef(cb)

	useEffect(() => {
		lastCbRef.current = cb
	}, [cb])

	const delayedCb = useCallback(
		(...args: Args) => {
			const thisOne = Symbol()
			currentCallRef.current = thisOne
			void timedPromise.then(() => {
				if (!mounted.current) return
				if (currentCallRef.current !== thisOne) {
					return
				}

				lastCbRef.current(...args)
			})
		},
		[timedPromise],
	)

	return delayedCb
}

function useUsersLocation() {
	const workshopTitle = useOptionalWorkshopTitle()
	const requestInfo = useRequestInfo()
	const rawParams = useParams()
	const paramsResult = ExerciseAppParamsSchema.safeParse(rawParams)
	const params = paramsResult.success ? paramsResult.data : null

	return {
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
}

function usePresenceSocket(user?: User | null) {
	const prefs = usePresencePreferences()
	const { userHasAccess = false, userId, presence } = useRootLoaderData() ?? {}
	const [users, setUsers] = useState(presence?.users ?? [])
	const usersLocation = useUsersLocation()

	const handleMessage = useFirstCallDelayedCallback((evt: MessageEvent) => {
		const messageResult = MessageSchema.safeParse(JSON.parse(String(evt.data)))
		if (!messageResult.success) return
		if (messageResult.data.type === 'presence') {
			setUsers(messageResult.data.payload.users)
		}
	}, 2000)

	const socket = usePartySocket({
		host: new URL(partykitBaseUrl).host,
		room: partykitRoom,
		onMessage: handleMessage,
	})

	let message: Message | null = null
	if (user) {
		if (prefs?.optOut) {
			message = { type: 'remove-user', payload: { id: user.id } }
		} else {
			message = {
				type: 'add-user',
				payload: {
					id: user.id,
					name: user.name,
					hasAccess: userHasAccess,
					imageUrlSmall: user.imageUrlSmall,
					imageUrlLarge: user.imageUrlLarge,
					location: usersLocation,
				},
			}
		}
	} else if (userId?.id) {
		message = {
			type: 'add-user',
			payload: { id: userId.id, location: usersLocation },
		}
	}

	const messageJson = message ? JSON.stringify(message) : null
	useEffect(() => {
		if (messageJson) socket.send(messageJson)
	}, [messageJson, socket])

	const scoredUsers = scoreUsers(
		{ id: userId?.id, location: usersLocation },
		users,
	)

	return { users: scoredUsers }
}

function scoreUsers(
	user: { id?: string | null; location: User['location'] },
	users: Array<User>,
) {
	const { location } = user
	const scoredUsers = users.map((user) => {
		let score = 0
		const available = 5
		if (user.hasAccess) {
			score += 1
		}
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
		if (a.user.id === user?.id) return -1
		if (b.user.id === user?.id) return 1
		if (a.score === b.score) return 0
		return a.score > b.score ? -1 : 1
	})
}

function PresenceOnline({
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

function PresenceOffline({
	user,
	children,
}: {
	user?: User | null
	children: React.ReactNode
}) {
	const usersLocation = useUsersLocation()
	const { presence } = useRootLoaderData() ?? {}
	return (
		<PresenceContext.Provider
			value={{
				users: scoreUsers(
					{ id: user?.id, location: usersLocation },
					presence?.users ?? [],
				),
			}}
		>
			{children}
		</PresenceContext.Provider>
	)
}

export function Presence({
	user,
	children,
}: {
	user?: User | null
	children: React.ReactNode
}) {
	const isOnline = useIsOnline()
	if (isOnline) {
		return <PresenceOnline user={user}>{children}</PresenceOnline>
	} else {
		return <PresenceOffline user={user}>{children}</PresenceOffline>
	}
}

export function usePresence() {
	const presence = useContext(PresenceContext)
	if (!presence) {
		throw new Error('usePresence must be used within a PresenceProvider')
	}
	return presence
}
