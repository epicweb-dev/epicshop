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

function useProductHost() {
	const data = useRootLoaderData()
	return data?.workshopConfig?.product?.host ?? null
}

function useLoggedInProductHosts() {
	const data = useRootLoaderData()
	return data?.loggedInProductHosts ?? []
}

function useUsersLocation() {
	const workshopTitle = useOptionalWorkshopTitle()
	const requestInfo = useRequestInfo()
	const productHost = useProductHost()
	const rawParams = useParams()
	const paramsResult = ExerciseAppParamsSchema.safeParse(rawParams)
	const params = paramsResult.success ? paramsResult.data : null
	const { ENV, repoUpdates } = useRootLoaderData() ?? {}

	// Extract epicshopVersion and repoStatus from root loader data
	const epicshopVersion = ENV?.EPICSHOP_APP_VERSION ?? null
	const repoStatus =
		repoUpdates && 'updatesAvailable' in repoUpdates ? { ...repoUpdates } : null

	return {
		workshopTitle,
		origin: requestInfo.origin,
		productHost,
		epicshopVersion,
		repoStatus,
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
	const { userId, presence, userHasAccess } = useRootLoaderData() ?? {}
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

	const socket = usePartySocket({
		host: new URL(partykitBaseUrl).host,
		room: partykitRoom,
		onMessage: handleMessage,
	})

	// Find the current user in presence.users (includes epicshopVersion, repoStatus, etc.)
	const currentUserId = user?.id ?? userId?.id
	const currentUserFromPresence = currentUserId
		? presence?.users?.find((u) => u.id === currentUserId)
		: null

	// Use the user data from presence.users as the base (has epicshopVersion, repoStatus, etc.)
	// Merge with user prop if provided, then override with dynamic fields
	const baseUser = currentUserFromPresence ?? user ?? {}

	let message: Message | null = null
	if (currentUserId) {
		if (prefs?.optOut) {
			// Send opt-out user with minimal info instead of removing entirely
			message = {
				type: 'add-user',
				payload: {
					...baseUser,
					id: currentUserId,
					hasAccess: userHasAccess,
					optOut: true,
					loggedInProductHosts,
					location: usersLocation,
				},
			}
		} else {
			// Use the user data as-is, only update dynamic fields
			message = {
				type: 'add-user',
				payload: {
					...baseUser,
					id: currentUserId,
					hasAccess: userHasAccess,
					location: usersLocation,
					loggedInProductHosts,
				},
			}
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
