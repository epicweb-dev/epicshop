import {
	MessageSchema,
	partykitBaseUrl,
	partykitRoom,
	type Message,
	type User,
} from '@epic-web/workshop-presence/presence'
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

function useProductHost() {
	const data = useRootLoaderData()
	return data?.workshopConfig?.product?.host ?? null
}

function useLoggedInProductHosts() {
	const data = useRootLoaderData()
	return data?.loggedInProductHosts ?? []
}

type ReconnectableWebSocketOptions = {
	url: string
	onMessage: (event: MessageEvent) => void
	getDataToSendOnOpen?: () => string | null
	onOpen?: (event: Event) => void
	onClose?: (event: CloseEvent) => void
}

function getBackoffDelayMs(attempt: number) {
	// Exponential backoff with jitter. Fast initial retry, capped.
	const baseDelayMs = 250
	const maxDelayMs = 10_000
	const expDelay = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt)
	const jitterMultiplier = 0.5 + Math.random() * 0.5 // 0.5x .. 1.0x
	return Math.round(expDelay * jitterMultiplier)
}

function useReconnectableWebSocket({
	url,
	onMessage,
	getDataToSendOnOpen,
	onOpen,
	onClose,
}: ReconnectableWebSocketOptions) {
	const wsRef = useRef<WebSocket | null>(null)
	const reconnectTimeoutRef = useRef<number | null>(null)
	const reconnectAttemptRef = useRef(0)
	const mountedRef = useRef(false)

	// Track latest handlers without forcing reconnections.
	const onMessageRef = useRef(onMessage)
	const getDataToSendOnOpenRef = useRef(getDataToSendOnOpen)
	const onOpenRef = useRef(onOpen)
	const onCloseRef = useRef(onClose)
	useEffect(() => {
		onMessageRef.current = onMessage
		getDataToSendOnOpenRef.current = getDataToSendOnOpen
		onOpenRef.current = onOpen
		onCloseRef.current = onClose
	}, [onMessage, getDataToSendOnOpen, onOpen, onClose])

	const connect = useCallback(() => {
		// Don’t connect during SSR and don’t reconnect after unmount.
		if (typeof window === 'undefined') return
		if (!mountedRef.current) return

		if (reconnectTimeoutRef.current != null) {
			window.clearTimeout(reconnectTimeoutRef.current)
			reconnectTimeoutRef.current = null
		}

		// Close any existing socket before creating a new one.
		try {
			// Use a normal close code so we don't trigger our reconnect handler.
			wsRef.current?.close(1000, 'reconnect')
		} catch {
			// ignore
		}

		let ws: WebSocket
		try {
			ws = new WebSocket(url)
		} catch {
			// If construction fails (bad URL, blocked, etc.), retry.
			const delay = getBackoffDelayMs(reconnectAttemptRef.current++)
			reconnectTimeoutRef.current = window.setTimeout(() => connect(), delay)
			return
		}

		wsRef.current = ws

		ws.onopen = (event) => {
			reconnectAttemptRef.current = 0
			const dataToSend = getDataToSendOnOpenRef.current?.()
			if (dataToSend) {
				try {
					ws.send(dataToSend)
				} catch {
					// ignore
				}
			}
			onOpenRef.current?.(event)
		}
		ws.onmessage = (event) => {
			onMessageRef.current(event)
		}
		ws.onclose = (event) => {
			onCloseRef.current?.(event)

			// If we intentionally closed (1000), don’t reconnect.
			// For redeploys (often 1006/1012) or transient issues, reconnect.
			if (!mountedRef.current) return
			if (event.code === 1000) return

			const delay = getBackoffDelayMs(reconnectAttemptRef.current++)
			reconnectTimeoutRef.current = window.setTimeout(() => connect(), delay)
		}
		ws.onerror = () => {
			// Some browsers only fire onclose after onerror, but some don’t.
			// If we’re not open, force a close to unify the reconnect path.
			if (!mountedRef.current) return
			if (ws.readyState === WebSocket.OPEN) return
			try {
				ws.close()
			} catch {
				// ignore
			}
		}
	}, [url])

	useEffect(() => {
		mountedRef.current = true
		connect()
		return () => {
			mountedRef.current = false
			if (reconnectTimeoutRef.current != null) {
				window.clearTimeout(reconnectTimeoutRef.current)
				reconnectTimeoutRef.current = null
			}
			try {
				wsRef.current?.close(1000, 'unmount')
			} catch {
				// ignore
			}
			wsRef.current = null
		}
	}, [connect])

	const send = useCallback((data: string) => {
		const ws = wsRef.current
		if (!ws) return false
		if (ws.readyState !== WebSocket.OPEN) return false
		try {
			ws.send(data)
			return true
		} catch {
			return false
		}
	}, [])

	return { send }
}

function useUsersLocation() {
	const workshopTitle = useOptionalWorkshopTitle()
	const requestInfo = useRequestInfo()
	const productHost = useProductHost()
	const rawParams = useParams()
	const paramsResult = ExerciseAppParamsSchema.safeParse(rawParams)
	const params = paramsResult.success ? paramsResult.data : null

	return {
		workshopTitle,
		origin: requestInfo.origin,
		productHost,
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
	const loggedInProductHosts = useLoggedInProductHosts()

	const handleMessage = useFirstCallDelayedCallback((evt: MessageEvent) => {
		const messageResult = MessageSchema.safeParse(JSON.parse(String(evt.data)))
		if (!messageResult.success) return
		if (messageResult.data.type === 'presence') {
			setUsers(messageResult.data.payload.users)
		}
	}, 2000)

	const wsUrl = (() => {
		const base = new URL(partykitBaseUrl)
		// partykitBaseUrl is https://.../parties/main/<room>
		// Convert it to the WS endpoint while preserving host + path.
		base.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:'
		// Ensure the path ends at /parties/main/<room>
		base.pathname = `/parties/main/${partykitRoom}`
		base.search = ''
		base.hash = ''
		return base.toString()
	})()

	// We want to re-announce the latest presence message on every (re)connect,
	// especially after presence server redeploys.
	const latestMessageJsonRef = useRef<string | null>(null)
	const { send } = useReconnectableWebSocket({
		url: wsUrl,
		onMessage: handleMessage,
		getDataToSendOnOpen: () => latestMessageJsonRef.current,
	})

	let message: Message | null = null
	if (user) {
		if (prefs?.optOut) {
			// Send opt-out user with minimal info instead of removing entirely
			message = {
				type: 'add-user',
				payload: {
					id: user.id,
					optOut: true,
					loggedInProductHosts,
				},
			}
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
					loggedInProductHosts,
				},
			}
		}
	} else if (userId?.id) {
		message = {
			type: 'add-user',
			payload: { id: userId.id, location: usersLocation, loggedInProductHosts },
		}
	}

	const messageJson = message ? JSON.stringify(message) : null
	useEffect(() => {
		latestMessageJsonRef.current = messageJson
		if (messageJson) send(messageJson)
	}, [messageJson, send])

	const scoredUsers = scoreUsers(
		{ id: userId?.id, location: usersLocation },
		users,
	)

	return { users: scoredUsers }
}

/**
 * Get all locations for a user (from locations array or falling back to location)
 */
function getUserLocations(user: User): Array<NonNullable<User['location']>> {
	if (user.locations && user.locations.length > 0) {
		return user.locations.filter(Boolean) as Array<
			NonNullable<User['location']>
		>
	}
	if (user.location) {
		return [user.location]
	}
	return []
}

/**
 * Sorts and scores users based on proximity to the current user.
 *
 * Sorting order:
 * 1. Self first
 * 2. Same exercise step (exerciseNumber + stepNumber + type)
 * 3. Same exercise (exerciseNumber)
 * 4. Same workshop (workshopTitle)
 * 5. Same product host
 * 6. Most products logged into
 * 7. Opted-out users last
 */
function scoreUsers(
	currentUser: { id?: string | null; location: User['location'] },
	users: Array<User>,
) {
	const { location } = currentUser

	const scoredUsers = users.map((user) => {
		// Calculate score for visual styling (0-1)
		// Higher score = closer proximity = more prominent display
		let score = 0

		// Opted-out users get no score for visual purposes
		if (user.optOut) {
			return { user, score: 0 }
		}

		const userLocations = getUserLocations(user)

		// Check if any of the user's locations match the current user's location
		for (const userLoc of userLocations) {
			// Same workshop title
			if (
				location?.workshopTitle &&
				location.workshopTitle === userLoc.workshopTitle
			) {
				score = Math.max(score, 0.4)

				// Same exercise
				if (
					location.exercise?.exerciseNumber != null &&
					location.exercise.exerciseNumber === userLoc.exercise?.exerciseNumber
				) {
					score = Math.max(score, 0.6)

					// Same step
					if (
						location.exercise.stepNumber != null &&
						location.exercise.stepNumber === userLoc.exercise?.stepNumber
					) {
						score = Math.max(score, 0.8)

						// Same type (problem/solution)
						if (
							location.exercise.type &&
							location.exercise.type === userLoc.exercise?.type
						) {
							score = 1
						}
					}
				}
			} else if (
				location?.productHost &&
				location.productHost === userLoc.productHost
			) {
				// Same product host but different workshop
				score = Math.max(score, 0.2)
			}
		}

		return { user, score }
	})

	return scoredUsers.sort((a, b) => {
		// Self always first
		if (a.user.id === currentUser.id) return -1
		if (b.user.id === currentUser.id) return 1

		// Opted-out users always last
		if (a.user.optOut && !b.user.optOut) return 1
		if (!a.user.optOut && b.user.optOut) return -1

		// Same step (exerciseNumber + stepNumber + type match)
		const aOnSameStep = userHasSameStep(location, a.user)
		const bOnSameStep = userHasSameStep(location, b.user)
		if (aOnSameStep && !bOnSameStep) return -1
		if (!aOnSameStep && bOnSameStep) return 1

		// Same exercise (exerciseNumber match)
		const aOnSameExercise = userHasSameExercise(location, a.user)
		const bOnSameExercise = userHasSameExercise(location, b.user)
		if (aOnSameExercise && !bOnSameExercise) return -1
		if (!aOnSameExercise && bOnSameExercise) return 1

		// Same workshop
		const aOnSameWorkshop = userHasSameWorkshop(location, a.user)
		const bOnSameWorkshop = userHasSameWorkshop(location, b.user)
		if (aOnSameWorkshop && !bOnSameWorkshop) return -1
		if (!aOnSameWorkshop && bOnSameWorkshop) return 1

		// Same product host
		const aOnSameProductHost = userHasSameProductHost(location, a.user)
		const bOnSameProductHost = userHasSameProductHost(location, b.user)
		if (aOnSameProductHost && !bOnSameProductHost) return -1
		if (!aOnSameProductHost && bOnSameProductHost) return 1

		// Most products logged into
		const aProductCount = a.user.loggedInProductHosts?.length ?? 0
		const bProductCount = b.user.loggedInProductHosts?.length ?? 0
		if (aProductCount !== bProductCount) {
			return bProductCount - aProductCount
		}

		return 0
	})
}

function userHasSameStep(
	currentLocation: User['location'],
	user: User,
): boolean {
	if (!currentLocation?.exercise) return false
	const userLocations = getUserLocations(user)
	return userLocations.some(
		(loc) =>
			loc.workshopTitle === currentLocation.workshopTitle &&
			loc.exercise?.exerciseNumber ===
				currentLocation.exercise?.exerciseNumber &&
			loc.exercise?.stepNumber === currentLocation.exercise?.stepNumber &&
			loc.exercise?.type === currentLocation.exercise?.type,
	)
}

function userHasSameExercise(
	currentLocation: User['location'],
	user: User,
): boolean {
	if (!currentLocation?.exercise?.exerciseNumber) return false
	const userLocations = getUserLocations(user)
	return userLocations.some(
		(loc) =>
			loc.workshopTitle === currentLocation.workshopTitle &&
			loc.exercise?.exerciseNumber === currentLocation.exercise?.exerciseNumber,
	)
}

function userHasSameWorkshop(
	currentLocation: User['location'],
	user: User,
): boolean {
	if (!currentLocation?.workshopTitle) return false
	const userLocations = getUserLocations(user)
	return userLocations.some(
		(loc) => loc.workshopTitle === currentLocation.workshopTitle,
	)
}

function userHasSameProductHost(
	currentLocation: User['location'],
	user: User,
): boolean {
	if (!currentLocation?.productHost) return false
	const userLocations = getUserLocations(user)
	return userLocations.some(
		(loc) => loc.productHost === currentLocation.productHost,
	)
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
