import {
	cachified,
	makeSingletonCache,
} from '@epic-web/workshop-utils/cache.server'
import { getWorkshopConfig } from '@epic-web/workshop-utils/config.server'
import {
	getAuthInfo,
	getLoggedInProductHosts,
	getPreferences,
} from '@epic-web/workshop-utils/db.server'
import { getEnv } from '@epic-web/workshop-utils/env.server'
import {
	getUserInfo,
	userHasAccessToWorkshop,
} from '@epic-web/workshop-utils/epic-api.server'
import { checkForUpdatesCached } from '@epic-web/workshop-utils/git.server'
import { type Timings } from '@epic-web/workshop-utils/timing.server'
import { getUserId } from '@epic-web/workshop-utils/user.server'
import {
	PresenceSchema,
	partykitBaseUrl,
	type Location,
	type RepoStatus,
	type User,
} from './presence.ts'

export const presenceCache = makeSingletonCache<Array<User>>('PresenceCache')

export async function getPresentUsers({
	timings,
	request,
}: { timings?: Timings; request?: Request } = {}): Promise<Array<User>> {
	const presence = await cachified({
		key: 'presence',
		cache: presenceCache,
		timings,
		request,
		ttl: 1000 * 2,
		swr: 1000 * 60 * 60 * 24,
		offlineFallbackValue: { users: [] },
		checkValue: PresenceSchema,
		async getFreshValue(context) {
			try {
				const response = await Promise.race([
					fetch(`${partykitBaseUrl}/presence`),
					new Promise<Response>((resolve) =>
						setTimeout(() => {
							resolve(new Response('Timeout', { status: 500 }))
						}, 500),
					),
				] as const)
				if (response.statusText === 'Timeout') {
					throw new Error(`Timeout fetching partykit presence`)
				}
				if (!response.ok) {
					throw new Error(
						`Unexpected response from partykit: ${response.status} ${response.statusText}`,
					)
				}
				const presence = PresenceSchema.parse(await response.json())
				return presence
			} catch {
				// console.error(err)
				context.metadata.ttl = 300
				return { users: [] }
			}
		},
	})
	const { users } = presence

	const authInfo = await getAuthInfo()
	const userId = request
		? (await getUserId({ request })).id
		: (authInfo?.id ?? null)

	const preferences = await getPreferences()
	const isOptOut = preferences?.presence.optOut ?? false

	// If no userId, just return other users
	if (!userId) {
		return uniqueUsers(users)
	}

	// Get logged in product hosts for the local user
	const loggedInProductHosts = await getLoggedInProductHosts()

	// Get epicshop version and repo status
	const ENV = getEnv()
	const epicshopVersion = ENV.EPICSHOP_APP_VERSION ?? null

	// Get repo status (updates available, commits ahead/behind)
	let repoStatus: RepoStatus | null = null
	try {
		const updateStatus = await checkForUpdatesCached()
		if ('updatesAvailable' in updateStatus) {
			repoStatus = {
				updatesAvailable: updateStatus.updatesAvailable,
				commitsAhead:
					'commitsAhead' in updateStatus ? updateStatus.commitsAhead : null,
				commitsBehind:
					'commitsBehind' in updateStatus ? updateStatus.commitsBehind : null,
				localCommit:
					'localCommit' in updateStatus ? updateStatus.localCommit : null,
				remoteCommit:
					'remoteCommit' in updateStatus ? updateStatus.remoteCommit : null,
			}
		}
	} catch {
		// Ignore errors from checking for updates
	}

	const config = getWorkshopConfig()
	const url = request ? new URL(request.url) : undefined

	// Build location with version and repo status
	const location: Location = {
		workshopTitle: config.title,
		origin: url ? url.origin : undefined,
		productHost: config.product.host,
		epicshopVersion,
		repoStatus,
	}
	if (url) {
		if (url.pathname.startsWith('/exercise/')) {
			const [exerciseNumber, stepNumber, type] = url.pathname
				.split('/')
				.slice(2)
			location.exercise = {
				exerciseNumber: isNaN(Number(exerciseNumber))
					? null
					: Number(exerciseNumber),
				stepNumber: isNaN(Number(stepNumber)) ? null : Number(stepNumber),
				type:
					type === 'problem'
						? 'problem'
						: type === 'solution'
							? 'solution'
							: null,
			}
		}
	}

	// If opted out, include user with minimal info but still include location
	if (isOptOut) {
		const optOutUser: User = {
			id: userId,
			optOut: true,
			loggedInProductHosts,
			location,
		}
		return uniqueUsers([...users.filter((u) => u.id !== userId), optOutUser])
	}

	// Build full user info
	const user: User = {
		id: userId,
		loggedInProductHosts,
		location,
	}

	if (authInfo) {
		const [userInfo, hasAccess] = await Promise.all([
			getUserInfo({ request, timings }),
			userHasAccessToWorkshop({ request, timings }),
		])

		Object.assign(user, {
			name: userInfo?.name,
			avatarUrl: userInfo?.imageUrlLarge,
			imageUrlSmall: userInfo?.imageUrlSmall,
			imageUrlLarge: userInfo?.imageUrlLarge,
			hasAccess,
		})
	}

	return uniqueUsers([...users.filter((u) => u.id !== userId), user])
}

// A user maybe on the same page in multiple tabs
// so let's make sure we only show them once
function uniqueUsers(users: Array<User>) {
	const seen = new Set()
	return users.filter(Boolean).filter((user) => {
		if (seen.has(user.id)) {
			return false
		}
		seen.add(user.id)
		return true
	})
}
